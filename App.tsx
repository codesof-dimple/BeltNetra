import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Activity, Bell, Download, Gauge, HeartPulse, Pause, Play, Power, RotateCcw, Search, Thermometer, Timer, Trash2, Waves, Weight, type LucideIcon } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DEFAULT_TH, FAULTS, faultLabel } from './engine'
import { useConveyor } from './useConveyor'
import type { AlertEvent, FaultKey, Metric, SensorKey, Sev, Thresholds } from './types'

type Tone = Sev | 'info'
const C: Record<Tone, [string, string]> = {
  normal: ['text-emerald-400', 'border-emerald-400/30 bg-emerald-400/10'],
  warning: ['text-amber-400', 'border-amber-400/30 bg-amber-400/10'],
  critical: ['text-red-400', 'border-red-400/30 bg-red-400/10'],
  info: ['text-sky-400', 'border-sky-400/30 bg-sky-400/10'],
}
const btn = 'rounded-md border border-edge bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-40'

const fmt = (v: number | undefined, d = 1) => (v === undefined ? '—' : v.toFixed(d))
const hms = (ts: number) => new Date(ts).toLocaleTimeString([], { hour12: false })
const dt = (ts: number) => new Date(ts).toLocaleString([], { hour12: false })

function csv(name: string, rows: (string | number | boolean | undefined)[][]) {
  const body = rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }))
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const Chip = ({ s, children }: { s: Tone; children: ReactNode }) => (
  <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${C[s][0]} ${C[s][1]}`}>{children}</span>
)

const Panel = ({ title, right, children, className = '' }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`min-w-0 rounded-xl border border-edge bg-panel p-4 ${className}`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      {right}
    </div>
    {children}
  </section>
)

function Kpi({ icon: Icon, label, value, unit, tone, note }: { icon: LucideIcon; label: string; value: string; unit?: string; tone: Tone; note: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-edge bg-panel p-3">
      <div className="flex items-center justify-between text-xs text-slate-400"><span>{label}</span><Icon size={16} className={C[tone][0]} /></div>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}<span className="ml-1 text-xs font-normal text-slate-400">{unit}</span></p>
      <p className={`mt-0.5 truncate text-xs ${C[tone][0]}`}>{note}</p>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="flex gap-2 tabular-nums text-slate-300"><span>{now.toLocaleDateString([], { dateStyle: 'medium' })}</span><span>{now.toLocaleTimeString([], { hour12: false })}</span></span>
}

const Spark = ({ vals, color }: { vals: (number | undefined)[]; color: string }) => (
  <div className="my-2 h-9">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={vals.map(v => ({ v }))}><Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart>
    </ResponsiveContainer>
  </div>
)

/* Original schematic: not a rendering of the physical prototype. */
const SPOTS: [number, number, string, FaultKey | null][] = [[82, 24, 'Temp (motor)', 'overheat'], [300, 110, 'Load cell', 'overload'], [450, 110, 'Piezo', 'vibration'], [580, 108, 'Hall', 'slip']]
function Schematic({ running, sev }: { running: boolean; sev: Record<FaultKey, Sev> }) {
  const vals = Object.values(sev)
  const col = vals.includes('critical') ? '#f87171' : vals.includes('warning') ? '#fbbf24' : '#34d399'
  return (
    <svg viewBox="0 0 640 150" role="img" aria-label="Conveyor schematic with sensor locations" className="w-full">
      <rect x="60" y="66" width="520" height="22" rx="11" fill="#0a1220" stroke="#1e2d47" />
      <line x1="72" y1="77" x2="568" y2="77" stroke={col} strokeWidth="4" strokeDasharray="12 12" className={running ? 'belt-run' : ''} />
      {[60, 580].map(x => <circle key={x} cx={x} cy="77" r="22" fill="#101b2e" stroke={col} strokeWidth="3" />)}
      {[200, 320, 440].map(x => <circle key={x} cx={x} cy="96" r="6" fill="#1e2d47" />)}
      <rect x="14" y="10" width="56" height="28" rx="5" fill="#101b2e" stroke="#38bdf8" />
      <text x="42" y="28" fontSize="12" fill="#38bdf8" textAnchor="middle">Motor</text>
      <text x="320" y="56" fontSize="14" fill="#38bdf8" textAnchor="middle">›  ›  ›  ›  ›</text>
      {SPOTS.map(([x, y, t, f]) => (
        <g key={t}>
          <circle cx={x} cy={y} r="4" fill="#22d3ee" />
          <text x={y < 40 ? x + 10 : x} y={y < 40 ? y + 4 : y + 18} fontSize="11" fill="#8aa0c0" textAnchor={y < 40 ? 'start' : 'middle'}>{t}</text>
          {f && sev[f] !== 'normal' && <circle cx={x} cy={y} r="12" fill="none" stroke={sev[f] === 'critical' ? '#f87171' : '#fbbf24'} strokeWidth="2" className="animate-pulse" />}
        </g>
      ))}
      {sev.stoppage !== 'normal' && <circle cx="320" cy="77" r="14" fill="none" stroke="#f87171" strokeWidth="2" className="animate-pulse" />}
    </svg>
  )
}

interface SensorDef { key: SensorKey; name: string; icon: LucideIcon; field: Metric; unit: string; digits: number; faults: FaultKey[]; range: (t: Thresholds) => string }
const SENSORS: SensorDef[] = [
  { key: 'load', name: 'Load cell + HX711', icon: Weight, field: 'loadKg', unit: 'kg', digits: 1, faults: ['overload'], range: t => `0 to ${t.maxLoad} kg` },
  { key: 'temperature', name: 'Temperature', icon: Thermometer, field: 'temperatureC', unit: '°C', digits: 1, faults: ['overheat'], range: t => `below ${t.tempWarn} °C` },
  { key: 'hall', name: 'Hall effect (speed)', icon: Gauge, field: 'beltSpeedMps', unit: 'm/s', digits: 2, faults: ['slip', 'stoppage'], range: t => `${t.expectedSpeed} m/s ±${t.slipTolPct} %` },
  { key: 'vibration', name: 'Piezo (vibration)', icon: Waves, field: 'vibrationLevel', unit: 'AU', digits: 1, faults: ['vibration'], range: t => `below ${t.vibWarn} AU` },
]

const METRICS: Record<Metric, { label: string; unit: string; color: string; lim: (t: Thresholds) => number[] }> = {
  temperatureC: { label: 'Temperature', unit: '°C', color: '#fbbf24', lim: t => [t.tempWarn, t.tempCrit] },
  loadKg: { label: 'Load', unit: 'kg', color: '#22d3ee', lim: t => [t.maxLoad * 0.9, t.maxLoad] },
  vibrationLevel: { label: 'Vibration', unit: 'AU', color: '#a78bfa', lim: t => [t.vibWarn, t.vibCrit] },
  beltSpeedMps: { label: 'Belt speed', unit: 'm/s', color: '#34d399', lim: t => [t.expectedSpeed] },
}
const RANGES = { '1 min': 60, '5 min': 300, '15 min': 900, '1 hour': 3600 }

const FIELDS: [keyof Thresholds, string, string, number, number, number][] = [
  ['tempWarn', 'Temperature warning', '°C', 20, 150, 1], ['tempCrit', 'Temperature critical', '°C', 20, 200, 1],
  ['maxLoad', 'Maximum load', 'kg', 1, 500, 1], ['expectedSpeed', 'Expected speed', 'm/s', 0.05, 5, 0.05],
  ['vibWarn', 'Vibration warning', 'AU', 1, 100, 1], ['vibCrit', 'Vibration critical', 'AU', 1, 100, 1],
  ['slipTolPct', 'Slip tolerance', '%', 1, 50, 1], ['pulseTimeoutS', 'Missing-pulse timeout', 's', 1, 60, 1],
  ['staleTimeoutS', 'Stale-data timeout', 's', 1, 60, 1],
]

function ThresholdsPanel({ th, setTh }: { th: Thresholds; setTh: Dispatch<SetStateAction<Thresholds>> }) {
  const [draft, setDraft] = useState<Partial<Record<keyof Thresholds, string>>>({})
  const order = th.tempWarn >= th.tempCrit || th.vibWarn >= th.vibCrit
  return (
    <Panel title="Detection thresholds" right={<button className={btn} onClick={() => { setTh(DEFAULT_TH); setDraft({}) }}>Restore defaults</button>}>
      <p className="mb-3 text-xs text-amber-400">Demonstration values. Calibrate them to the real conveyor before relying on any alert.</p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(([k, label, unit, lo, hi, step]) => {
          const raw = draft[k] ?? String(th[k])
          const bad = raw === '' || Number(raw) < lo || Number(raw) > hi
          return (
            <label key={k} className="text-xs text-slate-400">{label} ({unit})
              <input type="number" inputMode="decimal" min={lo} max={hi} step={step} value={raw} aria-invalid={bad}
                onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, [k]: v })); const num = Number(v); if (v !== '' && num >= lo && num <= hi) setTh(t => ({ ...t, [k]: num })) }}
                className={`mt-1 block w-full rounded-md border bg-ink px-2 py-1.5 text-sm tabular-nums text-slate-100 ${bad ? 'border-red-400' : 'border-edge'}`} />
              {bad && <span className="text-red-400">Enter {lo} to {hi}</span>}
            </label>
          )
        })}
      </div>
      {order && <p role="alert" className="mt-3 text-xs text-red-400">Warning thresholds must stay below critical thresholds.</p>}
    </Panel>
  )
}

const DEMO: [string, FaultKey][] = [['Trigger overload', 'overload'], ['Trigger overheating', 'overheat'], ['Trigger belt slip', 'slip'], ['Trigger abnormal vibration', 'vibration'], ['Simulate belt stoppage', 'stoppage'], ['Simulate sensor disconnect', 'sensor']]

export default function App() {
  const c = useConveyor()
  const { data, sev, evidence, alerts, th, sim, paused } = c
  const last = data[data.length - 1]
  const [lvl, setLvl] = useState<'warning' | 'critical'>('critical')
  const [metric, setMetric] = useState<Metric>('temperatureC')
  const [range, setRange] = useState<keyof typeof RANGES>('5 min')
  const [q, setQ] = useState('')
  const [fs, setFs] = useState<'all' | AlertEvent['severity']>('all')
  const [fst, setFst] = useState<'all' | AlertEvent['status']>('all')

  const all = Object.keys(sev) as FaultKey[]
  const worst = (ks: FaultKey[]): Sev => (ks.some(k => sev[k] === 'critical') ? 'critical' : ks.some(k => sev[k] === 'warning') ? 'warning' : 'normal')
  const status = paused ? 'Paused' : sev.stoppage !== 'normal' ? 'Stopped' : worst(all) === 'critical' ? 'Fault' : 'Running'
  const real = alerts.filter(a => a.severity !== 'info')
  const open = real.filter(a => a.status === 'active').length
  const nCrit = real.filter(a => a.severity === 'critical').length
  const hs: Sev = c.health >= 80 ? 'normal' : c.health >= 50 ? 'warning' : 'critical'
  const pad = (n: number) => String(n).padStart(2, '0')
  const M = METRICS[metric]
  const step = Math.max(1, Math.ceil(Math.min(data.length, RANGES[range]) / 240))
  const pts = data.slice(-RANGES[range]).filter((_, i) => i % step === 0).map(r => ({ t: hms(r.timestamp), v: r[metric] }))
  const shown = alerts.filter(a => (fs === 'all' || a.severity === fs) && (fst === 'all' || a.status === fst) && `${faultLabel(a.fault)} ${a.source} ${a.reading}`.toLowerCase().includes(q.toLowerCase()))

  const exportData = () => csv('conveyorguard-sensor-data.csv', [
    ['timestamp', 'temperatureC', 'loadKg', 'beltSpeedMps', 'hallPulseCount', 'vibrationLevel', 'motorRunning'],
    ...data.map(r => [new Date(r.timestamp).toISOString(), r.temperatureC, r.loadKg, r.beltSpeedMps, r.hallPulseCount, r.vibrationLevel, r.motorRunning]),
  ])
  const exportEvents = () => csv('conveyorguard-events.csv', [
    ['time', 'severity', 'category', 'source', 'reading', 'simulated', 'status'],
    ...alerts.map(a => [new Date(a.ts).toISOString(), a.severity, faultLabel(a.fault), a.source, a.reading, a.simulated, a.status]),
  ])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-ink/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400/15 text-cyan-300"><Activity size={18} /></span>
          <div><p className="text-base font-semibold leading-tight">ConveyorGuard</p><p className="text-xs text-slate-400">Conveyor belt health monitoring</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Clock />
          <Chip s="info">Simulation mode</Chip>
          <Chip s={paused ? 'warning' : 'normal'}>{paused ? 'Simulated feed paused' : 'Simulated feed live'}</Chip>
          <span className="rounded border border-edge px-1.5 py-0.5 text-slate-400">No hardware connected</span>
          <span className="relative text-slate-300" role="img" aria-label={`${open} open alerts`} title="Open alerts">
            <Bell size={18} />
            {open > 0 && <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{open}</span>}
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-4 p-4">
        <Panel title="Demo controls" right={<Chip s="info">Simulated data</Chip>}>
          <div className="flex flex-wrap items-center gap-2">
            <button className={`${btn} border-emerald-400/40 text-emerald-300`} onClick={c.startNormal}>Start normal operation</button>
            {DEMO.map(([label, f]) => (
              <button key={f} aria-pressed={c.isActive(f)} onClick={() => c.trigger(f, lvl)} className={`${btn} ${c.isActive(f) ? 'border-amber-400 text-amber-300' : ''}`}>{label}</button>
            ))}
            <button className={btn} onClick={c.resetFaults}>Reset all faults</button>
            <span className="mx-1 hidden h-5 w-px bg-edge sm:block" />
            <button className={btn} onClick={c.togglePause}>{paused ? <Play size={12} className="mr-1 inline" /> : <Pause size={12} className="mr-1 inline" />}{paused ? 'Resume' : 'Pause'}</button>
            <button className={btn} onClick={c.fullReset}><RotateCcw size={12} className="mr-1 inline" />Reset simulation</button>
            <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={lvl === 'warning'} onChange={e => setLvl(e.target.checked ? 'warning' : 'critical')} />Start scenarios at warning level</label>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi icon={Power} label="Conveyor status" value={status} tone={status === 'Running' ? (worst(all) === 'warning' ? 'warning' : 'normal') : status === 'Paused' ? 'warning' : 'critical'} note={`${open} open alert${open === 1 ? '' : 's'}`} />
          <Kpi icon={Gauge} label="Belt speed" value={fmt(last?.beltSpeedMps, 2)} unit="m/s" tone={worst(['slip', 'stoppage'])} note={`Expected ${th.expectedSpeed} m/s`} />
          <Kpi icon={Weight} label="Current load" value={fmt(last?.loadKg)} unit="kg" tone={worst(['overload'])} note={`Limit ${th.maxLoad} kg`} />
          <Kpi icon={Thermometer} label="Motor / bearing temperature" value={fmt(last?.temperatureC)} unit="°C" tone={worst(['overheat'])} note={`Warning at ${th.tempWarn} °C`} />
          <Kpi icon={Waves} label="Vibration / impact" value={fmt(last?.vibrationLevel)} unit="AU" tone={worst(['vibration'])} note={`Warning at ${th.vibWarn} AU`} />
          <Kpi icon={HeartPulse} label="Health score" value={String(Math.round(c.health))} unit="/ 100" tone={hs} note="Rule-based, not predictive" />
          <Kpi icon={Bell} label="Detected events" value={String(real.length)} tone={nCrit ? 'critical' : real.length ? 'warning' : 'normal'} note={`${nCrit} critical, ${real.length - nCrit} warning`} />
          <Kpi icon={Timer} label="System uptime" value={`${pad(Math.floor(c.uptime / 3600))}:${pad(Math.floor(c.uptime / 60) % 60)}:${pad(c.uptime % 60)}`} tone="normal" note="Since last reset" />
        </div>

        <Panel title="Conveyor schematic" right={<Chip s={status === 'Running' ? 'normal' : status === 'Paused' ? 'warning' : 'critical'}>{status}</Chip>}>
          <Schematic running={!paused && sev.stoppage === 'normal'} sev={sev} />
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {SENSORS.map(s => {
            const ok = last !== undefined && last.sensorConnectionStatus[s.key] && last[s.field] !== undefined
            const tone: Tone = ok ? worst(s.faults) : 'critical'
            return (
              <div key={s.key} className="min-w-0 rounded-xl border border-edge bg-panel p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium"><s.icon size={16} className="text-cyan-400" />{s.name}</span>
                  <Chip s={tone}>{ok ? (tone === 'normal' ? 'normal' : tone) : 'no signal'}</Chip>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{fmt(last?.[s.field], s.digits)}<span className="ml-1 text-xs font-normal text-slate-400">{s.unit}</span></p>
                <p className="text-xs text-slate-400">Normal: {s.range(th)} (demo value)</p>
                <Spark vals={data.slice(-60).map(r => r[s.field])} color={METRICS[s.field].color} />
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Updated {last ? hms(last.timestamp) : '—'}</span>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={!sim.disabled.has(s.key)} onChange={() => c.toggleSensor(s.key)} aria-label={`Enable simulated ${s.name}`} />Enabled</label>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Real-time analytics" right={<button className={btn} onClick={exportData} disabled={!data.length}><Download size={12} className="mr-1 inline" />Sensor data CSV</button>}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {(Object.keys(METRICS) as Metric[]).map(m => <button key={m} aria-pressed={m === metric} onClick={() => setMetric(m)} className={`${btn} ${m === metric ? 'border-cyan-400 text-cyan-300' : ''}`}>{METRICS[m].label}</button>)}
              <span className="mx-1 h-5 w-px bg-edge" />
              {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map(r => <button key={r} aria-pressed={r === range} onClick={() => setRange(r)} className={`${btn} ${r === range ? 'border-cyan-400 text-cyan-300' : ''}`}>{r}</button>)}
            </div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pts} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="#1e2d47" strokeDasharray="3 3" />
                  <XAxis dataKey="t" tick={{ fill: '#8aa0c0', fontSize: 11 }} minTickGap={48} />
                  <YAxis tick={{ fill: '#8aa0c0', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#0a1220', border: '1px solid #1e2d47', borderRadius: 8 }} formatter={v => `${Number(v).toFixed(2)} ${M.unit}`} />
                  {M.lim(th).map((y, i, a) => <ReferenceLine key={i} y={y} stroke={a.length === 2 ? (i ? '#f87171' : '#fbbf24') : '#38bdf8'} strokeDasharray="4 4" />)}
                  <Line type="monotone" dataKey="v" name={M.label} stroke={M.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-slate-400">Dashed lines show warning and critical thresholds. Up to 1 hour of samples is kept in memory.</p>
          </Panel>

          <Panel title="Defect detection center" right={<Chip s="info">Rule-based, simulated</Chip>}>
            <p className="mb-3 text-xs text-slate-400">A flagged condition is a possible abnormal state indicated by sensor rules. It is not a physically confirmed defect.</p>
            <ul className="grid gap-2">
              {all.map(k => {
                const evt = alerts.find(a => a.fault === k && a.severity !== 'info')
                const canAck = alerts.some(a => a.fault === k && a.status === 'active')
                return (
                  <li key={k} className="grid gap-2 rounded-lg border border-edge p-2.5 text-xs sm:grid-cols-[150px_1fr_auto]">
                    <div><p className="text-sm font-medium text-slate-100">{FAULTS[k].label}</p><Chip s={sev[k]}>{sev[k]}</Chip></div>
                    <div className="min-w-0 text-slate-400">
                      <p>Evidence: {evidence[k] ?? '—'}</p>
                      <p>Detected: {sev[k] !== 'normal' && evt ? dt(evt.ts) : '—'}</p>
                      <p>Action: {FAULTS[k].action}</p>
                    </div>
                    <button className={`${btn} self-start`} disabled={!canAck} onClick={() => c.ackFault(k)}>Acknowledge</button>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Alerts and events" className="xl:col-span-2" right={
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={exportEvents} disabled={!alerts.length}><Download size={12} className="mr-1 inline" />Events CSV</button>
              <button className={btn} disabled={!alerts.length} onClick={() => { if (window.confirm('Delete all events from this browser? This cannot be undone.')) c.clearAlerts() }}><Trash2 size={12} className="mr-1 inline" />Clear all</button>
            </div>}>
            <div className="mb-3 flex flex-wrap gap-2">
              <label className="relative min-w-40 flex-1"><Search size={14} className="absolute left-2 top-2 text-slate-400" /><span className="sr-only">Search events</span>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search events" className="w-full rounded-md border border-edge bg-ink py-1.5 pl-7 pr-2 text-xs" /></label>
              <select aria-label="Filter by severity" value={fs} onChange={e => setFs(e.target.value as typeof fs)} className={`${btn} bg-panel`}>
                <option value="all">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
              </select>
              <select aria-label="Filter by status" value={fst} onChange={e => setFst(e.target.value as typeof fst)} className={`${btn} bg-panel`}>
                <option value="all">All statuses</option><option value="active">Active</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option>
              </select>
            </div>
            {shown.length === 0 && <p className="rounded-lg border border-dashed border-edge p-4 text-center text-xs text-slate-400">{alerts.length ? 'No events match these filters.' : 'No events yet. Trigger a scenario in the demo controls to see detections here.'}</p>}
            <ul className="grid max-h-96 gap-2 overflow-y-auto">
              {shown.slice(0, 60).map(a => (
                <li key={a.id} className="grid gap-2 rounded-lg border border-edge p-2.5 text-xs sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><Chip s={a.severity}>{a.severity}</Chip><span className="font-medium text-slate-100">{faultLabel(a.fault)}</span><span className="text-slate-400">{dt(a.ts)}</span>{a.simulated && <Chip s="info">simulated</Chip>}</div>
                    <p className="mt-1 text-slate-400">{a.source}: {a.reading}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400">{a.status}</span>
                    {a.status === 'active' && a.severity !== 'info' && <button className={btn} onClick={() => c.ack(a.id)}>Acknowledge</button>}
                    {a.status !== 'resolved' && <button className={btn} onClick={() => c.resolve(a.id)}>Resolve</button>}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <ThresholdsPanel th={th} setTh={c.setTh} />
        </div>
      </main>

      {c.toast && (
        <div role="alert" className="fixed bottom-4 right-4 z-20 max-w-sm rounded-xl border border-red-400/50 bg-panel p-3 text-sm shadow-xl">
          <p className="font-semibold text-red-400">Critical: {faultLabel(c.toast.fault)}</p>
          <p className="mt-1 text-xs text-slate-300">{c.toast.reading}</p>
          <button className={`${btn} mt-2`} onClick={c.dismissToast}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
