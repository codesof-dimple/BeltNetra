import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TH, Detector, FAULTS, NORMAL_SEV, Simulator, sanitize } from './engine'
import type { AlertEvent, FaultKey, Reading, SensorKey, Sev, Thresholds } from './types'

const MAX_SAMPLES = 3600 // 1 h at 1 Hz: bounded buffer, never grows further
const MAX_EVENTS = 200
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage blocked or full */ }
}

export function useConveyor() {
  const [sim] = useState(() => new Simulator())
  const [det] = useState(() => new Detector())
  const [th, setTh] = useState<Thresholds>(() => ({ ...DEFAULT_TH, ...read<Partial<Thresholds>>('cg.th', {}) }))
  const [alerts, setAlerts] = useState<AlertEvent[]>(() => { const a = read<AlertEvent[]>('cg.alerts', []); return Array.isArray(a) ? a : [] })
  const [data, setData] = useState<Reading[]>([])
  const [sev, setSev] = useState(NORMAL_SEV)
  const [evidence, setEvidence] = useState({} as Record<FaultKey, string>)
  const [paused, setPaused] = useState(false)
  const [uptime, setUptime] = useState(0)
  const [health, setHealth] = useState(100)
  const [toast, setToast] = useState<AlertEvent | null>(null)
  const [, bump] = useState(0)
  const thRef = useRef(th)

  useEffect(() => { thRef.current = th; sim.expectedSpeed = th.expectedSpeed; write('cg.th', th) }, [th, sim])
  useEffect(() => { write('cg.alerts', alerts) }, [alerts])
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    sim.start(raw => {
      const r = sanitize(raw)
      const now = Date.now()
      const out = det.evaluate(r, thRef.current, now, true)
      setData(d => [...d.slice(1 - MAX_SAMPLES), r])
      setSev(out.sev)
      setEvidence(out.evidence)
      setUptime(u => u + 1)
      setHealth(h => {
        const penalty = Object.values(out.sev).reduce((s, v) => s + (v === 'critical' ? 30 : v === 'warning' ? 12 : 0), 0)
        return h + (Math.max(0, 100 - penalty) - h) * 0.3
      })
      if (out.events.length || out.recovered.length) {
        const made = out.events.map((e): AlertEvent => ({ ...e, id: uid(), status: 'active' }))
        const info = out.recovered.map((k): AlertEvent => ({ id: uid(), ts: now, fault: k, severity: 'info', source: FAULTS[k].source, reading: 'Returned to normal', simulated: true, status: 'resolved' }))
        const crit = made.find(e => e.severity === 'critical')
        if (crit) setToast(crit)
        const rec = out.recovered as string[]
        setAlerts(a => [...made, ...info, ...a.map((x): AlertEvent => (rec.includes(x.fault) && x.status !== 'resolved' ? { ...x, status: 'resolved' } : x))].slice(0, MAX_EVENTS))
      }
    })
    return () => sim.stop() // clears the interval on unmount / StrictMode re-run
  }, [sim, det])

  const log = (e: Omit<AlertEvent, 'id'>) => setAlerts(a => [{ ...e, id: uid() }, ...a].slice(0, MAX_EVENTS))
  const refresh = () => bump(n => n + 1)
  const setStatus = (match: (a: AlertEvent) => boolean, status: AlertEvent['status']) =>
    setAlerts(a => a.map(x => (match(x) && x.status !== 'resolved' ? { ...x, status } : x)))
  const note = (reading: string) => log({ ts: Date.now(), fault: 'system', severity: 'info', source: 'Demo panel', reading, simulated: true, status: 'resolved' })

  const resetFaults = () => { sim.faults.clear(); sim.disabled.clear(); note('All simulated faults cleared'); refresh() }

  return {
    sim, th, setTh, alerts, data, sev, evidence, paused, uptime, health, toast,
    dismissToast: () => setToast(null),
    isActive: (f: FaultKey) => (f === 'sensor' ? sim.disabled.has('temperature') : sim.faults.has(f)),
    trigger(f: FaultKey, level: Sev) {
      if (f === 'sensor') sim.disabled.add('temperature')
      else sim.faults.set(f, level)
      log({ ts: Date.now(), fault: f, severity: 'info', source: 'Demo panel', reading: f === 'sensor' ? 'Temperature sensor disconnected (simulated)' : `Scenario started at ${level} level (simulated)`, simulated: true, status: 'resolved' })
      refresh()
    },
    resetFaults,
    startNormal() { resetFaults(); if (sim.paused) { sim.paused = false; setPaused(false) } },
    toggleSensor(k: SensorKey) { if (sim.disabled.has(k)) sim.disabled.delete(k); else sim.disabled.add(k); refresh() },
    togglePause() { sim.paused = !sim.paused; setPaused(sim.paused) },
    fullReset() {
      sim.reset(); det.reset()
      setData([]); setUptime(0); setHealth(100); setSev(NORMAL_SEV); setEvidence({} as Record<FaultKey, string>); setPaused(false)
      note('Simulation reset'); refresh()
    },
    ack: (id: string) => setStatus(a => a.id === id && a.status === 'active', 'acknowledged'),
    resolve: (id: string) => setStatus(a => a.id === id, 'resolved'),
    ackFault: (f: FaultKey) => setStatus(a => a.fault === f && a.status === 'active', 'acknowledged'),
    clearAlerts: () => setAlerts([]),
  }
}
