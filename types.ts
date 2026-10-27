export type Sev = 'normal' | 'warning' | 'critical'
export type FaultKey = 'overload' | 'overheat' | 'vibration' | 'slip' | 'stoppage' | 'sensor'
export type SensorKey = 'temperature' | 'load' | 'hall' | 'vibration'
export type Metric = 'temperatureC' | 'loadKg' | 'beltSpeedMps' | 'vibrationLevel'

/** Normalised sample. Every sensor field is optional: missing means "no valid data". */
export interface Reading {
  timestamp: number // ms since epoch, stamped by the dashboard on arrival
  temperatureC?: number
  loadKg?: number
  beltSpeedMps?: number
  hallPulseCount?: number // cumulative counter
  vibrationLevel?: number // normalised piezo amplitude, arbitrary units (AU)
  motorRunning: boolean // commanded / expected state
  sensorConnectionStatus: Record<SensorKey, boolean>
}

export interface Thresholds {
  tempWarn: number
  tempCrit: number
  maxLoad: number
  vibWarn: number
  vibCrit: number
  expectedSpeed: number
  slipTolPct: number
  pulseTimeoutS: number
  staleTimeoutS: number
}

export interface AlertEvent {
  id: string
  ts: number
  fault: FaultKey | 'system'
  severity: 'info' | 'warning' | 'critical'
  source: string
  reading: string // evidence captured at the moment of the event
  simulated: boolean
  status: 'active' | 'acknowledged' | 'resolved'
}

/** Anything that produces readings: the simulator today, an ESP32 bridge later. */
export interface DataProvider {
  readonly mode: 'simulation' | 'hardware'
  start(onReading: (r: Reading) => void): void
  stop(): void
}
