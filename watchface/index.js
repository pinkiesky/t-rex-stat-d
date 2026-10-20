import * as ui from '@zos/ui';
import { Time, Step, Battery, TIME_HOUR_FORMAT_12 } from '@zos/sensor';
import { getDeviceInfo } from '@zos/device';
import { debugLog, debugCount, debugSummary } from '../shared/debug';

// The installed app SDK types omit this watch-face data binding.
/** @type {typeof ui.data_type & { WEATHER_CURRENT: number }} */
const DATA_TYPE = /** @type {typeof ui.data_type & { WEATHER_CURRENT: number }} */ (ui.data_type);
// Watch-face normal-display flag; not exported by @zos/ui.
const NORMAL_DISPLAY = { show_level: 1 };
const COLOR = { background: 0x000000, primary: 0x66ff88, secondary: 0x3d9960 };
const FONT = { header: 29, clock: 120, steps: 29, metric: 29, footer: 25 };
// Packaged custom font used by the modern TEXT widget.
const FONT_PATH = 'fonts/Modeseven-L3n5.ttf';
// Enable only while inspecting layout on the simulator/watch.
const DEBUG = false;
// Modeseven: 600-unit advance / 1000 units per em, plus char_space.
const GRID = { x: 64, y: 80, cellWidth: FONT.metric * 0.6 + 1, cellHeight: FONT.metric, rowGap: 2 };
const LAYOUT = { size: 480, columns: 20, valueColumn: 8, metricRow: 6 };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const pad = (value) => (value < 10 ? '0' + value : String(value));

const valid = (value) => typeof value === 'number' && Number.isFinite(value);

function createLoggedWidget(type, options) {
  const widget = ui.createWidget(type, options);

  debugCount('widgetsCreated');
  debugLog('ui.create', { type, x: options.x, y: options.y });

  return widget;
}

function formatTime(time, twelveHour) {
  return pad(twelveHour ? time.hour % 12 || 12 : time.hour) + ':' + pad(time.minute);
}

function formatDate(time) {
  // Gregorian weekday from the sensor's local calendar, independent of host timezone.
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const year = time.year - (time.month < 3 ? 1 : 0);
  const weekday =
    (year +
      Math.floor(year / 4) -
      Math.floor(year / 100) +
      Math.floor(year / 400) +
      offsets[time.month - 1] +
      time.day) %
    7;

  return { weekday: DAYS[weekday], date: MONTHS[time.month - 1] + ' ' + pad(time.day) };
}

function formatMetric(value, suffix, minimum = 0, maximum = Infinity) {
  if (!valid(value) || value < minimum || value > maximum) {
    return '--';
  }
  const digits = String(Math.floor(value));

  return (suffix === '' ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : digits) + suffix;
}

function gridBox({ column = 0, row = 0, columns = 1, rows = 1 }) {
  // Round shared edges, not widths, to avoid gaps from fractional font advances.
  const x = Math.round(GRID.x + column * GRID.cellWidth);
  const rowPitch = GRID.cellHeight + GRID.rowGap;
  const y = Math.round(GRID.y + row * rowPitch);

  return {
    x,
    y,
    w: Math.round(GRID.x + (column + columns) * GRID.cellWidth) - x,
    h: Math.round(GRID.y + (row + rows) * rowPitch) - y - GRID.rowGap
  };
}

function drawDebugLine({ x, y, w, h, color = 0x163822 }) {
  createLoggedWidget(ui.widget.FILL_RECT, {
    radius: 0,
    angle: 0,
    x,
    y,
    w,
    h,
    color,
    ...NORMAL_DISPLAY
  });
}

function drawDebugGrid() {
  if (!DEBUG) {
    return;
  }
  for (let column = Math.ceil(-GRID.x / GRID.cellWidth); ; column++) {
    const { x } = gridBox({ column });

    if (x >= LAYOUT.size) {
      break;
    }
    drawDebugLine({ x, y: 0, w: 1, h: LAYOUT.size });
  }
  for (let row = Math.ceil(-GRID.y / (GRID.cellHeight + GRID.rowGap)); ; row++) {
    const { y } = gridBox({ row });

    if (y >= LAYOUT.size) {
      break;
    }
    drawDebugLine({ x: 0, y, w: LAYOUT.size, h: 1 });
  }
}

function drawSymbolEdges({ x, y, w, h, size }) {
  if (!DEBUG) {
    return;
  }
  const advance = size * 0.6 + 1;
  const top = Math.round(y + (h - size) / 2);
  const color = 0x38784a;

  // Cell boundaries include glyph side bearings, not the ink outline.
  for (let column = 0; column * advance <= w; column++) {
    drawDebugLine({ x: Math.round(x + column * advance), y: top, w: 1, h: size, color });
  }
  drawDebugLine({ x, y: top, w, h: 1, color });
  drawDebugLine({ x, y: top + size, w, h: 1, color });
}

function createText({
  column = 0,
  row,
  columns = LAYOUT.columns,
  rows = 1,
  size = FONT.metric,
  text = '--',
  color = COLOR.primary,
  offsetX = 0,
  offsetY = 0
}) {
  const box = gridBox({ column, row, columns, rows });
  const widget = createLoggedWidget(ui.widget.TEXT, {
    x: box.x + offsetX,
    y: box.y + offsetY,
    w: box.w,
    h: box.h,
    text,
    color,
    text_size: size,
    font: FONT_PATH,
    char_space: 1,
    align_h: ui.align.LEFT,
    align_v: ui.align.CENTER_V,
    text_style: ui.text_style.ELLIPSIS,
    ...NORMAL_DISPLAY
  });

  drawSymbolEdges({ ...box, size });

  return { widget, text, name: 'row' + row + '.col' + column };
}

function createTemperature({ row }) {
  const position = {
    column: LAYOUT.valueColumn,
    row,
    columns: LAYOUT.columns - LAYOUT.valueColumn
  };
  const box = gridBox(position);
  const root = 'temperature/';

  createLoggedWidget(ui.widget.TEXT_IMG, {
    ...box,
    type: DATA_TYPE.WEATHER_CURRENT,
    // Leave text unset: setting it overrides the system data binding.
    font_array: Array.from({ length: 10 }, (_, digit) => root + digit + '.png'),
    negative_image: root + 'minus.png',
    unit_en: root + 'C.png',
    unit_sc: root + 'C.png',
    unit_tc: root + 'C.png',
    imperial_unit_en: root + 'F.png',
    imperial_unit_sc: root + 'F.png',
    imperial_unit_tc: root + 'F.png',
    h_space: 0,
    align_h: ui.align.LEFT,
    ...NORMAL_DISPLAY
  });

  drawSymbolEdges({ ...box, size: FONT.metric });
}

function setText(field, text) {
  debugCount('textChecks');
  if (field.text !== text) {
    field.widget.setProperty(ui.prop.MORE, { text });
    field.text = text;
    debugCount('textWrites');
    debugLog('ui.text.write', { field: field.name, text });
  } else {
    debugCount('textUnchanged');
    debugLog('ui.text.unchanged', { field: field.name });
  }
}

function initializeSensors() {
  debugLog('sensors.create', { names: ['Time', 'Step', 'Battery'] });

  return {
    time: new Time(),
    steps: new Step(),
    battery: new Battery()
  };
}

function getDeviceName() {
  try {
    const info = getDeviceInfo();
    /** @type {unknown} */
    const name = info && info.deviceName;

    if (typeof name === 'string') {
      // Compact the reported name into a terminal-style device argument.
      return (
        name
          .toLowerCase()
          .replace(/^amazfit[\s-]*/, '')
          .replace(/[^a-z0-9]/g, '')
          .replace(/[0-9]{2}mm$/g, '') || 'unknown'
      );
    }
  } catch (_) {
    debugLog('device.info.error', { error: String(_) });
  }

  return 'unknown';
}

function createWidgets() {
  createLoggedWidget(ui.widget.FILL_RECT, {
    radius: 0,
    angle: 0,
    x: 0,
    y: 0,
    w: LAYOUT.size,
    h: LAYOUT.size,
    color: COLOR.background,
    ...NORMAL_DISPLAY
  });
  drawDebugGrid();
  createText({ row: 0, size: FONT.header, text: '$ stat -d ' + getDeviceName() });
  const fields = {
    weekday: createText({
      column: LAYOUT.valueColumn,
      row: 1,
      columns: 3,
      size: FONT.header,
      text: '--',
      color: COLOR.primary
    }),
    date: createText({
      column: 0,
      row: 1,
      columns: 6,
      size: FONT.header,
      text: '--',
      color: COLOR.secondary
    }),
    time: createText({
      row: 2,
      rows: 4,
      size: FONT.clock,
      text: '--:--',
      offsetX: -9,
      columns: 40
    }),
    steps: null,
    battery: null
  };
  const metrics = [
    { key: 'steps', label: 'steps', size: FONT.steps },
    { key: 'battery', label: 'bat', size: FONT.metric },
    { key: 'weather', label: 'temp', size: FONT.metric }
  ];

  metrics.forEach((metric, index) => {
    const row = LAYOUT.metricRow + index;

    createText({ row, columns: LAYOUT.valueColumn, text: metric.label, color: COLOR.secondary });
    if (metric.key === 'weather') {
      createTemperature({ row });
    } else {
      fields[metric.key] = createText({
        column: LAYOUT.valueColumn,
        row,
        columns: LAYOUT.columns - LAYOUT.valueColumn,
        size: metric.size,
        text: '--'
      });
    }
  });

  createText({
    row: LAYOUT.metricRow + metrics.length,
    columns: 1,
    size: FONT.footer,
    text: '$'
  });

  return fields;
}

function createController(sensors, fields) {
  let active = false;
  let destroyed = false;
  let timerId = null;
  const subscriptions = [];

  Object.keys(fields).forEach((name) => {
    fields[name].name = name;
  });

  const updateSteps = () => {
    debugLog('steps.update', { active });
    if (active) {
      debugCount('stepReads');
      setText(fields.steps, formatMetric(sensors.steps.getCurrent(), ''));
    }
  };

  const updateBattery = () => {
    debugLog('battery.update', { active });
    if (active) {
      debugCount('batteryReads');
      setText(fields.battery, formatMetric(sensors.battery.getCurrent(), '%', 0, 100));
    }
  };

  const updateClock = () => {
    debugLog('clock.update', { active });
    if (!active) {
      return;
    }
    debugCount('clockReads');
    const twelveHour = sensors.time.getHourFormat() === TIME_HOUR_FORMAT_12;
    const time = {
      year: sensors.time.getFullYear(),
      month: sensors.time.getMonth(),
      day: sensors.time.getDate(),
      hour: sensors.time.getHours(),
      minute: sensors.time.getMinutes()
    };

    setText(fields.time, formatTime(time, twelveHour));
    const date = formatDate(time);

    setText(fields.weekday, date.weekday);
    setText(fields.date, date.date);
    // Also refresh daily values at midnight; reads do not activate measurements.
    updateSteps();
    updateBattery();
  };

  function subscribe(name, sensor, callback) {
    const listener = () => {
      debugCount('sensorEvents');
      debugLog('sensor.change', { name, active, destroyed });
      callback();
    };

    debugLog('sensor.subscribe.request', { name });
    try {
      sensor.onChange(listener);
      subscriptions.push({ name, sensor, callback: listener });
      debugCount('subscriptionsAdded');
      debugLog('sensor.subscribe.ok', { name, count: subscriptions.length });
    } catch (error) {
      debugLog('sensor.subscribe.error', { name, error: String(error) });
    }
  }

  function scheduleMinute() {
    if (!active || destroyed) {
      debugLog('timer.schedule.skipped', { active, destroyed });

      return;
    }
    const second = sensors.time.getSeconds();
    const delay = valid(second) && second >= 0 && second < 60 ? (60 - second) * 1000 : 60000;

    timerId = setTimeout(() => {
      debugCount('timerTicks');
      debugLog('timer.tick', { id: timerId, active, destroyed });
      timerId = null;
      if (!active || destroyed) {
        debugLog('timer.tick.ignored', { active, destroyed });

        return;
      }
      updateClock();
      debugSummary('minute', { active, subscriptions: subscriptions.length });
      scheduleMinute();
    }, delay);
    debugCount('timersScheduled');
    debugLog('timer.schedule', { id: timerId, delayMs: delay });
  }

  function pause() {
    debugLog('controller.pause', { active, destroyed });
    active = false;
    if (timerId !== null) {
      clearTimeout(timerId);
      debugCount('timersCancelled');
      debugLog('timer.cancel', { id: timerId });
    }
    timerId = null;
    subscriptions.splice(0).forEach(({ name, sensor, callback }) => {
      try {
        debugLog('sensor.unsubscribe.request', { name });
        sensor.offChange(callback);
        debugCount('subscriptionsRemoved');
        debugLog('sensor.unsubscribe.ok', { name });
      } catch (_) {
        debugLog('sensor.unsubscribe.error', { name, error: String(_) });
      }
    });
    debugSummary('pause', { active, timerId, trackedSubscriptions: subscriptions.length });
  }

  return {
    resume() {
      debugLog('controller.resume', { active, destroyed });
      if (destroyed) {
        debugLog('controller.resume.ignored');

        return;
      }
      if (active) {
        debugLog('controller.resume.alreadyActive');
        updateClock();

        return;
      }
      active = true;
      updateClock();
      subscribe('steps', sensors.steps, updateSteps);
      subscribe('battery', sensors.battery, updateBattery);
      scheduleMinute();
    },
    pause,
    destroy() {
      debugLog('controller.destroy');
      destroyed = true;
      pause();
    }
  };
}

let controller = null;

WatchFace({
  build() {
    debugLog('watchface.build.start');
    const sensors = initializeSensors();

    controller = createController(sensors, createWidgets());
    createLoggedWidget(ui.widget.WIDGET_DELEGATE, {
      resume_call: () => {
        debugLog('lifecycle.resume');
        controller.resume();
      },
      pause_call: () => {
        debugLog('lifecycle.pause');
        controller.pause();
      }
    });
    controller.resume();
    debugSummary('build');
  },
  onDestroy() {
    debugLog('watchface.destroy');
    if (controller) {
      controller.destroy();
    }
  }
});
