# CLI Watch Face

Terminal-style watch face for Amazfit T-Rex 3 Pro 48 mm (480 × 480).
Minimum/compatible API is 3.0.0; target API is 4.2.0.

## Runtime and behavior

- `@zos/ui` creates text, rectangles, the system-bound current-temperature `TEXT_IMG`, and the watch-face lifecycle delegate.
- `@zos/sensor` supplies `Time`, `Step`, and `Battery`. Readings use getters; step and battery listeners use `onChange`/`offChange`.
- `@zos/device.getDeviceInfo()` supplies the compact device name in the command prompt.
- Global `setTimeout`/`clearTimeout` schedule one update at the next minute boundary and reschedule while active. Pause and destruction cancel the timer and remove listeners; resume refreshes values immediately.
- Permissions: `data:user.hd.step` and `data:os.device.info`.
- No GPS, network calls, or active health measurements are started.
- Temperature uses packaged Modeseven digit/minus/C/F images and the system weather binding. Generate assets with `node scripts/generate-temperature-font.cjs` (requires ImageMagick `convert`).
- Text uses the packaged `fonts/Modeseven-L3n5.ttf` font.

The watch-face `WatchFace` entry point and delegate remain. SDK declarations omit some watch-face-specific options, so normal-display flags and the weather data-type extension are supplied locally. Build and mock checks cannot establish native watch-face availability; verify launch, weather display, and sleep/wake behavior in the simulator and on the watch.

## Validation

Run `npm test`, `npm run lint`, `npm run format:check`, and `zeus build`.
Use `zeus dev -t 480x480-amazfit-t-rex-3-pro-48-mm` to send the face to the simulator.
The tests mock modern modules and timer globals, including cancellation of timer ID zero.
Existing layout checks flag the oversized clock box and manual clock offset; these layout choices are preserved by the migration.

API references: [Time](https://docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Time/), [Step](https://docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Step/), [Battery](https://docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Battery/), [device information](https://docs.zepp.com/docs/reference/device-app-api/newAPI/device/getDeviceInfo/), [clearTimeout](https://docs.zepp.com/docs/reference/device-app-api/newAPI/global/clearTimeout/).

## Code style

Run `npm run lint` and `npm run format:check` to check code style. Use
`npm run lint:fix` followed by `npm run format` to apply fixes.

ESLint uses flat configuration in `eslint.config.mjs` and recognizes ES modules and Zepp
watch-face lifecycle/timer globals. ESLint Stylistic requires a blank line before `return`, after
function declarations, and after groups of consecutive `const`/`let` declarations.
Consecutive variable declarations have no blank lines between them. Function
expressions assigned to `const`/`let` are separated by blank lines on both sides. Prettier uses two spaces, single quotes, semicolons, and
preserves these blank lines. Generated output and dependencies are ignored.

ESLint requires braces for all `if`/`else` and loop bodies, including single
statements, and semicolons at statement endings. Prettier also inserts semicolons.

### Symbol grid and debug overlay

Set `DEBUG = true` in `watchface/index.js` to display layout grid lines and character-cell boundaries. It defaults to `false`; no debug widgets are created when disabled. The overlay is static and adds no timers.

All text uses `createText({ column, row, columns, rows, size, text })`. Coordinates are zero-based; `gridBox` converts cell positions and spans to rounded pixel edges. `GRID` defines the origin and base cell size (29 px high with a 2 px row gap, 18.4 px wide, using Modeseven’s 0.6-em advance plus 1 px character spacing). The clock spans four rows; metric values and the weekday share column 8. Larger/smaller text also gets its own symbol boundaries in debug mode, including side bearings rather than glyph ink outlines. Font rendering still needs checking on the device, especially if the custom font falls back.

## Activity logging

`shared/debug.js` controls console diagnostics with `DEBUG_LOGS` (enabled for inspection). It is independent of the visual `DEBUG` grid. Log lines begin with `[watchstat]` and contain a sequence number, milliseconds since logger initialization, event name, and event details.

Logs cover app/watch-face creation and destruction, delegate pause/resume, repeated/ignored resume calls, sensor initialization and change callbacks, subscription/removal successes and errors, timer schedules/ticks/cancellation, widget creation, text writes, and unchanged text skips. Summaries at build, minute refresh, pause, and app destruction contain cumulative counters. After pause, expect a cancelled timer, removed subscriptions, and no new scheduled work until resume. An unsubscribe error means the tracked count alone cannot confirm native listener removal.

The clock uses chained `setTimeout` calls, not `setInterval`. Diagnostics add no polling timer or additional sensor reads. System-managed `TEXT_IMG` weather refreshes occur inside the OS and are not observable through these JS logs. Logs show activity, not current draw or energy consumption; logging itself adds overhead. Set `DEBUG_LOGS = false` for normal use and battery comparisons.
