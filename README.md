# ConveyorGuard (stage 1: simulation engine + Overview dashboard)

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Structure
- `src/types.ts` normalised `Reading`, `Thresholds`, `AlertEvent`, and the `DataProvider` interface
- `src/engine.ts` `Simulator` (a DataProvider), rule-based `Detector` (latched severity, 10 s cooldown, 3-sample recovery hold), default thresholds (demo values)
- `src/useConveyor.ts` wires provider -> detector -> state; bounded buffers (3600 samples, 200 events); localStorage for thresholds and events
- `src/App.tsx` Overview UI: demo controls, KPIs, schematic, sensor cards, analytics, defect center, alerts, thresholds

## Demo workflow (about 2 minutes)
1. Show normal operation: green KPIs, moving belt, health near 100.
2. Click **Trigger overheating**: temperature climbs, warning then critical, toast appears, schematic marks the motor.
3. Open the defect center: read the sensor evidence, press **Acknowledge**, then **Resolve** in the event list.
4. Click **Reset all faults**: values recover, a "returned to normal" event is logged.
5. Repeat with belt slip, stoppage, and sensor disconnect. Change a threshold to show detection follows it.
6. Export the sensor and event CSVs.

## Hardware integration (not implemented yet)
Nothing in the UI claims a hardware connection. To add one, write a class implementing `DataProvider`
(`src/types.ts`), convert each message to a `Reading` (stamp `timestamp = Date.now()`, set a sensor's
`sensorConnectionStatus` false when its field is `null`/missing), then in `useConveyor.ts` replace
`new Simulator()` and pass `simulated = false` to `Detector.evaluate`.

- **USB Serial:** Web Serial API (Chrome/Edge), newline-delimited JSON at 115200 baud.
- **Wi-Fi:** ESP32 serves a WebSocket; the provider connects and reconnects with backoff.

Sample message (one per second; omit or null any sensor that is not connected):
```json
{"temperatureC": 41.8, "loadKg": 27.4, "hallPulseCount": 1520, "vibrationLevel": 13.2, "motorRunning": true}
```
`beltSpeedMps` can be sent, or derived in the provider from `hallPulseCount` deltas and your pulses-per-metre.

Untested ESP32 sketch (adjust pins, calibrate HX711, add a peak-detector circuit for the piezo):
```cpp
#include <HX711.h>
#include <OneWire.h>
#include <DallasTemperature.h>
HX711 scale; OneWire ow(4); DallasTemperature ds(&ow);
volatile uint32_t pulses = 0;
void IRAM_ATTR onPulse() { pulses++; }
String j(float v) { return isnan(v) ? "null" : String(v, 2); }
void setup() {
  Serial.begin(115200);
  scale.begin(16, 17); scale.set_scale(2280.f); scale.tare();  // calibrate!
  ds.begin(); pinMode(27, INPUT_PULLUP); attachInterrupt(27, onPulse, FALLING);
}
void loop() {
  ds.requestTemperatures();
  float t = ds.getTempCByIndex(0);
  float kg = scale.is_ready() ? scale.get_units(1) : NAN;
  Serial.println("{\"temperatureC\":" + j(t) + ",\"loadKg\":" + j(kg) + ",\"hallPulseCount\":" + String(pulses) +
                 ",\"vibrationLevel\":" + String(analogRead(34)) + ",\"motorRunning\":true}");
  delay(1000);
}
```

## Limitations and next stages
Not yet built: sidebar and the other pages (live monitoring, reports, device management, settings page, predictive maintenance),
light theme, multi-sensor comparison chart, date filter on events, alert sound, printable report, Framer Motion, hardware provider.
Thresholds are demonstration values. Detections are rule-based, not machine learning, and not validated on the real conveyor.
Sensor history is in memory only (1 hour); events and thresholds persist in localStorage.
