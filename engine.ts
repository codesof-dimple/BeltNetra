import type { AlertEvent, DataProvider, FaultKey, Reading, SensorKey, Sev, Thresholds } from './types'

/** DEMONSTRATION VALUES ONLY. Calibrate every threshold to the real conveyor. */
export const DEFAULT_TH: Thresholds = {
  tempWarn: 65, tempCrit: 80, maxLoad: 50, vibWarn: 40, vibCrit: 70,
  expectedSpeed: 0.5, slipTolPct: 15, pulseTimeoutS: 4, staleTimeoutS: 5,
}

export const FAULTS: Record<FaultKey, { label: string; source: string; action: string }> = {
  overload: { label: 'Overload', source: 'Load cell + HX711', action: 'Reduce the load and check for jammed material.' },
  overheat: { label: 'Overheating', source: 'Temperature sensor', action: 'Reduce duty cycle; inspect motor and bearing lubrication.' },
  vibration: { label: 'Abnormal vibration / impact', source: 'Piezo pickup', action: 'Inspect rollers, bearings and the belt splice.' },
  slip: { label: 'Belt slip', source: 'Hall sensor', action: 'Check belt tension and drive-roller grip.' },
  stoppage: { label: 'Belt stoppage', source: 'Hall sensor', action: 'Check motor power, coupling and jams.' },
  sensor: { label: 'Sensor failure', source: 'Sensor link', action: 'Check wiring and power of the flagged sensor.' },
}
export const faultLabel = (f: FaultKey | 'system') => (f === 'system' ? 'System' : FAULTS[f].label)
export const NORMAL_SEV: Record<FaultKey, Sev> = { overload: 'normal', overheat: 'normal', vibration: 'normal', slip: 'normal', stoppage: 'normal', sensor: 'normal' }

/** Non-finite numbers become "missing" instead of being treated as zero. */
export function sanitize(r: Reading): Reading {
  const ok = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return { ...r, temperatureC: ok(r.temperatureC), loadKg: ok(r.loadKg), beltSpeedMps: ok(r.beltSpeedMps), hallPulseCount: ok(r.hallPulseCount), vibrationLevel: ok(r.vibrationLevel) }
}

/* ------------------------------ Simulator ------------------------------ */
export class Simulator implements DataProvider {
  readonly mode = 'simulation' as const
  faults = new Map<FaultKey, Sev>() // active injected faults and their level
  disabled = new Set<SensorKey>() // sensors switched off (simulated disconnect)
  paused = false
  expectedSpeed = 0.5
  private timer = 0
  private t = 0
  private temp = 44
  private pulses = 0

  start(cb: (r: Reading) => void) {
    this.stop()
    this.timer = window.setInterval(() => { if (!this.paused) cb(this.tick()) }, 1000)
  }
  stop() { window.clearInterval(this.timer) }
  reset() { this.faults.clear(); this.disabled.clear(); this.paused = false; this.t = 0; this.temp = 44; this.pulses = 0 }

  private lvl(f: FaultKey, warn: number, crit: number, base: number) {
    const s = this.faults.get(f)
    return s === 'critical' ? crit : s === 'warning' ? warn : base
  }

  private tick(): Reading {
    const noise = (a: number) => (Math.random() - 0.5) * a
    this.t++
    const load = this.lvl('overload', 49, 62, 26 + 4 * Math.sin(this.t / 9)) + noise(2)
    this.temp += (this.lvl('overheat', 70, 88, 44 + load * 0.08) - this.temp) * 0.2 + noise(0.3)
    const speed = this.faults.has('stoppage') ? 0 : this.expectedSpeed * this.lvl('slip', 0.8, 0.6, 1) + noise(0.01)
    this.pulses += Math.round(Math.max(0, speed) * 20) // 20 pulses per metre (demo)
    const vib = this.lvl('vibration', 50, 80, 12) + Math.random() * 6
    const off = this.disabled
    return {
      timestamp: Date.now(),
      temperatureC: off.has('temperature') ? undefined : this.temp,
      loadKg: off.has('load') ? undefined : Math.max(0, load),
      hallPulseCount: off.has('hall') ? undefined : this.pulses,
      beltSpeedMps: off.has('hall') ? undefined : Math.max(0, speed),
      vibrationLevel: off.has('vibration') ? undefined : vib,
      motorRunning: true, // commanded state: the conveyor is expected to run
      sensorConnectionStatus: { temperature: !off.has('temperature'), load: !off.has('load'), hall: !off.has('hall'), vibration: !off.has('vibration') },
    }
  }
}

/* ------------------------------- Detector ------------------------------ */
export type NewEvent = Omit<AlertEvent, 'id' | 'status'>
export interface Evaluation { sev: Record<FaultKey, Sev>; evidence: Record<FaultKey, string>; events: NewEvent[]; recovered: FaultKey[] }

const RANK: Record<Sev, number> = { normal: 0, warning: 1, critical: 2 }
const COOLDOWN_MS = 10_000 // minimum gap before a cleared fault may raise a new alert
const HOLD_TICKS = 3 // consecutive normal samples required to count as recovered

/**
 * Rule-based prototype detection. A flagged state means "possible abnormal condition",
 * not a confirmed defect. Severity latches at its highest level until the fault clears,
 * so a value hovering near a threshold cannot raise repeated alerts.
 */
export class Detector {
  private st = new Map<FaultKey, { sev: Sev; ok: number; fired: number }>()
  private lastCount?: number
  private lastMove = Date.now()

  reset() { this.st.clear(); this.lastCount = undefined; this.lastMove = Date.now() }

  evaluate(r: Reading, th: Thresholds, now: number, simulated: boolean): Evaluation {
    const n = (x: number) => +x.toFixed(1)
    const hi = (v: number | undefined, w: number, c: number, u: string): [Sev, string] =>
      v === undefined ? ['normal', 'no valid reading'] : [v >= c ? 'critical' : v >= w ? 'warning' : 'normal', `${n(v)} ${u} (warn ≥ ${n(w)}, critical ≥ ${n(c)})`]

    if (r.hallPulseCount !== undefined && r.hallPulseCount !== this.lastCount) { this.lastCount = r.hallPulseCount; this.lastMove = now }
    const idle = (now - this.lastMove) / 1000
    const stopped = r.hallPulseCount !== undefined && r.motorRunning && idle >= th.pulseTimeoutS
    const speed = r.beltSpeedMps
    const dev = speed !== undefined && speed > 0.05 * th.expectedSpeed ? ((th.expectedSpeed - speed) / th.expectedSpeed) * 100 : 0
    const vals: Record<SensorKey, number | undefined> = { temperature: r.temperatureC, load: r.loadKg, hall: r.hallPulseCount, vibration: r.vibrationLevel }
    const bad = (Object.keys(vals) as SensorKey[]).filter(k => vals[k] === undefined || r.sensorConnectionStatus[k] === false)
    const stale = (now - r.timestamp) / 1000 > th.staleTimeoutS

    const raw: Record<FaultKey, [Sev, string]> = {
      overload: hi(r.loadKg, th.maxLoad * 0.9, th.maxLoad, 'kg'),
      overheat: hi(r.temperatureC, th.tempWarn, th.tempCrit, '°C'),
      vibration: hi(r.vibrationLevel, th.vibWarn, th.vibCrit, 'AU'),
      slip: [dev > th.slipTolPct * 2 ? 'critical' : dev > th.slipTolPct ? 'warning' : 'normal', `Speed ${speed?.toFixed(2) ?? '—'} m/s vs expected ${th.expectedSpeed} m/s (${n(Math.max(dev, 0))} % low, tolerance ${th.slipTolPct} %)`],
      stoppage: [stopped ? 'critical' : 'normal', stopped ? `No Hall pulses for ${Math.floor(idle)} s while motor is commanded on` : `Last Hall pulse ${Math.floor(idle)} s ago (timeout ${th.pulseTimeoutS} s)`],
      sensor: [bad.length || stale ? 'critical' : 'normal', stale ? 'Data stale: no fresh samples' : bad.length ? `Missing or invalid: ${bad.join(', ')}` : 'All sensors reporting'],
    }

    const events: NewEvent[] = []
    const recovered: FaultKey[] = []
    const sev = { ...NORMAL_SEV }
    const evidence = {} as Record<FaultKey, string>
    for (const k of Object.keys(raw) as FaultKey[]) {
      const [s, ev] = raw[k]
      const st = this.st.get(k) ?? { sev: 'normal' as Sev, ok: 0, fired: 0 }
      if (s !== 'normal') {
        st.ok = 0
        if (RANK[s] > RANK[st.sev]) {
          if (st.sev !== 'normal' || now - st.fired > COOLDOWN_MS) {
            events.push({ ts: now, fault: k, severity: s, source: FAULTS[k].source, reading: ev, simulated })
            st.fired = now
          }
          st.sev = s
        }
      } else if (st.sev !== 'normal' && ++st.ok >= HOLD_TICKS) {
        st.sev = 'normal'
        recovered.push(k)
      }
      this.st.set(k, st)
      sev[k] = st.sev
      evidence[k] = ev
    }
    return { sev, evidence, events, recovered }
  }
}
