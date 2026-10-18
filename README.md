# CLI Watch Face

Terminal-inspired JavaScript watch face for the configured Amazfit T-Rex 3 Pro
48 mm (480 × 480, Zepp OS 5 / device API 4.2). The device supports API 4.2, but this face selects the legacy runtime
(compatible/minimum 1.0.0, target 1.0.1), matching the installed Zeus watch-face
template. Device API capability and the selected JavaScript API family are distinct.
Selecting runtime 2.x/4.x left `hmSensor` undefined in the emulator.
Zeus 1.9.3 and @zeppos/device-types 4.0.0 were already installed.

## Behavior

- Terminal output layout: `user@t-rex:~$ watch_info`, a small date on its own
  line, large left-aligned HH:MM, then steps, battery percentage, and forecast rows.
  Metric values start at a shared, left-aligned tab stop after the labels.
- System 12/24-hour preference, AM/PM and English calendar date.
- Daily steps from the system sensor, with a change listener while active.
- Weather forecast low/high from the system cache, labeled `weather L/H`. Read on
  resume and at 30-minute boundaries using the existing minute timer. Values are
  shown as degrees in the units supplied by the system; no unit conversion or
  network request is performed.
- Battery percentage replaces heart rate. It refreshes on system change events,
  resume, and the existing minute timer. Heart-rate sensor access is removed.
- Missing readings display `--`; zero steps, zero battery, and zero forecast temperatures remain valid.
- One minute timer, initially aligned using the time sensor's seconds. No seconds
  are displayed. Timer resolution can put the initial update up to about a second
  after the boundary. Resume immediately rereads everything and realigns the timer.
- Pause/destroy stop the timer and remove listeners; unchanged text is not written.
- Native TEXT widgets requesting the Modeseven TTF font (experimental), fixed aligned columns, green on black,
  static prompt and separator. Overflow uses ellipsis instead of scrolling.
- Normal display only. No AOD, images for digits, network, GPS, or active measurements.

## Compatibility decisions

The installed declarations describe device application modules, not legacy
watch-face globals. `watchface/runtime.d.ts` supplies a narrow documented surface
and references the installed SDK declarations for the application lifecycle.
It is a type-checking aid, not evidence of device runtime compatibility.

Official watch-face references checked during implementation:

- [TEXT](https://docs.zepp.com/docs/watchface/api/hmUI/widget/TEXT/) documents spacing
  and alignment, but no custom TTF option. At the user’s request, all text widgets
  now pass the experimental `font: 'fonts/Modeseven-L3n5.ttf'` setting documented
  for device apps. Rendering support on the legacy runtime remains unverified.
  The source font is `assets/fonts/Modeseven-L3n5.ttf`; a copy in
  `assets/480x480-amazfit-t-rex-3-pro-48-mm/fonts/` packages it for this target.
  Keep that copy synchronized when replacing the source font. Firmware may ignore
  the setting and continue using its default font.
- [TIME](https://docs.zepp.com/docs/watchface/api/hmSensor/sensorId/TIME/) documents
  local calendar/time fields but no minute-change event. The documented
  [timer](https://docs.zepp.com/docs/watchface/api/timer/createTimer/) is used.
- [Time format](https://docs.zepp.com/docs/watchface/api/hmSetting/getTimeFormat/):
  zero means 12 hours, one means 24 hours.
- [STEP](https://docs.zepp.com/docs/watchface/api/hmSensor/sensorId/STEP/)
  provides the current value and CHANGE events.
- [BATTERY](https://docs.zepp.com/docs/watchface/api/hmSensor/sensorId/BATTERY/)
  provides the current percentage and CHANGE events.
- [Lifecycle delegate](https://docs.zepp.com/docs/watchface/api/hmUI/widget/DELEGATE/)
  handles pause/resume. Actual screen-off lifecycle delivery needs device testing.
- [WEATHER](https://docs.zepp.com/docs/watchface/api/hmSensor/sensorId/WEATHER/)
  supplies today’s forecast low/high (`forecastData.data[0]`), not current
  temperature. Missing or invalid data displays `--`. The row is omitted if the
  weather API is unavailable. No watch-face altitude API was confirmed.

## Validation

Use `npm test` for seven dependency-free tests (six mocked-runtime tests and one manifest regression check) and `npm run build`
for Zeus packaging. Use `zeus dev -t 480x480-amazfit-t-rex-3-pro-48-mm` for the
configured emulator. With an available TypeScript compiler, `tsc -p jsconfig.json`
checks JavaScript against the declarations.

Implementation validation on 2026-10-18:

- Zeus production build passed, including QuickJS compilation.
- TypeScript check passed using the existing compiler installed with Nest CLI.
- Initial tests passed: midnight rollover/live changes/no redundant writes;
  12-hour midnight/noon/leap day; pause/resume/destroy; missing/optional readings;
  circular text-box bounds and passive sensor subscriptions.
- Zeus reported the emulator connected and sent refreshes successfully.
- Visual emulator verification was unavailable: desktop capture failed, and the
  bridge screenshot route required login. No claim of verified pixel rendering,
  real sensor values, or hardware battery consumption is made. Test readings are
  fixtures only, never bundled in the production entry point.

Before device release, inspect header and five-digit steps with the device font,
check time and date across midnight and system format changes, step events and weather cache refresh,
missing battery data, and sleep/wake plus navigation pause/resume. Only the 480 × 480
configured target is implemented. The attachment supplied a text mockup, not a
separate reference image. The scaffold icon is retained.

Runtime correction: the user reported an emulator startup failure with `hmSensor`
undefined. The initial build/type checks and mocked tests did not verify runtime
API availability. The manifest now matches the official legacy watch-face template;
the device target and display size are unchanged.

## Code style

Run `npm run lint` and `npm run format:check` to check code style. Use
`npm run lint:fix` followed by `npm run format` to apply fixes.

ESLint uses flat configuration in `eslint.config.mjs` and recognizes the Zepp
watch-face globals. ESLint Stylistic requires a blank line before `return`, after
function declarations, and after groups of consecutive `const`/`let` declarations.
Consecutive variable declarations have no blank lines between them. Function
expressions assigned to `const`/`let` are separated by blank lines on both sides. Prettier uses two spaces, single quotes, semicolons, and
preserves these blank lines. Generated output and dependencies are ignored.

Weather change validation: seven tests passed, including negative/zero temperatures,
missing cache, unsupported weather, 30-minute refresh, resume refresh, and absence
of heart-rate display/sensor access after the battery replacement. Visual weather rendering still needs emulator/device
inspection.

ESLint requires braces for all `if`/`else` and loop bodies, including single
statements, and semicolons at statement endings. Prettier also inserts semicolons.

Battery replacement validation covers live changes, 0%, invalid readings, unchanged
text, and refresh after pause/resume. The existing missing-AM/PM-widget test failure
is unrelated to this change.

### Symbol grid and debug overlay

Set `DEBUG = true` in `watchface/index.js` to display layout grid lines and character-cell boundaries. It defaults to `false`; no debug widgets are created when disabled. The overlay is static and adds no timers.

All text uses `createText({ column, row, columns, rows, size, text })`. Coordinates are zero-based; `gridBox` converts cell positions and spans to rounded pixel edges. `GRID` defines the origin and base cell size (29 px high, 18.4 px wide, using Modeseven’s 0.6-em advance plus 1 px character spacing). The clock spans four rows; metric values share column 13. Larger/smaller text also gets its own symbol boundaries in debug mode, including side bearings rather than glyph ink outlines. Font rendering still needs checking on the device, especially if the custom font falls back.
