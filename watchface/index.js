// Requires the legacy 1.x runtime selected in app.json, even on API 4.2 devices.
// Watch-face globals and @zos application APIs are not interchangeable.
const COLOR = { background: 0x000000, primary: 0x66ff88, secondary: 0x3d9960 };
const FONT = { header: 29, clock: 115, steps: 29, metric: 29, footer: 25 };
// Experimental on the legacy watch-face runtime; custom TTF is documented for device apps.
const FONT_PATH = 'fonts/Modeseven-L3n5.ttf';
// Enable only while inspecting layout on the simulator/watch.
const DEBUG = false;
// Modeseven: 600-unit advance / 1000 units per em, plus char_space.
const GRID = { x: 64, y: 80, cellWidth: FONT.metric * 0.6 + 1, cellHeight: FONT.metric, rowGap: 2 };
const LAYOUT = { size: 480, columns: 19, valueColumn: 13, metricRow: 6 };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const pad = (value) => (value < 10 ? '0' + value : String(value));

const valid = (value) => typeof value === 'number' && Number.isFinite(value);

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

  return DAYS[weekday] + ' ' + MONTHS[time.month - 1] + ' ' + pad(time.day);
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
  hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x,
    y,
    w,
    h,
    color,
    show_level: hmUI.show_level.ONLY_NORMAL
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
  text,
  color = COLOR.primary
}) {
  const box = gridBox({ column, row, columns, rows });
  const widget = hmUI.createWidget(hmUI.widget.TEXT, {
    ...box,
    text,
    color,
    text_size: size,
    font: FONT_PATH,
    char_space: 1,
    align_h: hmUI.align.LEFT,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.ELLIPSIS,
    show_level: hmUI.show_level.ONLY_NORMAL
  });

  drawSymbolEdges({ ...box, size });

  return { widget, text };
}

function setText(field, text) {
  if (field && field.text !== text) {
    field.widget.setProperty(hmUI.prop.MORE, { text });
    field.text = text;
  }
}

function initializeSensors() {
  const sensors = {
    time: hmSensor.createSensor(hmSensor.id.TIME),
    steps: hmSensor.createSensor(hmSensor.id.STEP),
    weather: null,
    battery: hmSensor.createSensor(hmSensor.id.BATTERY)
  };

  try {
    if (hmSensor.id.WEATHER !== undefined) {
      const weather = hmSensor.createSensor(hmSensor.id.WEATHER);

      if (weather && typeof weather.getForecastWeather === 'function') {
        sensors.weather = weather;
      }
    }
  } catch (_) {
    /* Cached weather is optional; required metrics remain available. */
  }

  return sensors;
}

function createWidgets(sensors) {
  hmUI.createWidget(hmUI.widget.FILL_RECT, {
    x: 0,
    y: 0,
    w: LAYOUT.size,
    h: LAYOUT.size,
    color: COLOR.background,
    show_level: hmUI.show_level.ONLY_NORMAL
  });
  drawDebugGrid();
  createText({ row: 0, size: FONT.header, text: '$ watch_info' });
  const fields = {
    date: createText({ row: 5, size: FONT.header, text: '--', color: COLOR.secondary }),
    time: createText({ row: 1, rows: 4, size: FONT.clock, text: '--:--' }),
    steps: null,
    weather: null,
    battery: null
  };
  const metrics = [
    { key: 'steps', label: '/dev/steps', size: FONT.steps },
    { key: 'battery', label: '/dev/btr0', size: FONT.metric }
  ];

  if (sensors.weather) {
    metrics.push({ key: 'weather', label: '/dev/forecast', size: FONT.metric });
  }

  metrics.forEach((metric, index) => {
    const row = LAYOUT.metricRow + index;

    createText({ row, columns: LAYOUT.valueColumn, text: metric.label, color: COLOR.secondary });
    fields[metric.key] = createText({
      column: LAYOUT.valueColumn,
      row,
      columns: LAYOUT.columns - LAYOUT.valueColumn,
      size: metric.size,
      text: '--'
    });
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
  let weatherRefreshKey = null;
  const subscriptions = [];

  const updateSteps = () => {
    if (active) {
      setText(fields.steps, formatMetric(sensors.steps.current, ''));
    }
  };

  const updateWeather = (force = false) => {
    if (!active || !sensors.weather) {
      return;
    }
    const time = sensors.time;
    const key = [time.year, time.month, time.day, time.hour, Math.floor(time.minute / 30)].join(
      ':'
    );

    if (!force && weatherRefreshKey === key) {
      return;
    }
    weatherRefreshKey = key;
    try {
      const forecast = sensors.weather.getForecastWeather().forecastData;
      const today = forecast && forecast.count > 0 && forecast.data && forecast.data[0];

      if (
        !today ||
        !valid(today.low) ||
        !valid(today.high) ||
        today.low < -100 ||
        today.high > 100 ||
        today.low > today.high
      ) {
        setText(fields.weather, '--');

        return;
      }
      setText(fields.weather, Math.round(today.low) + '/' + Math.round(today.high) + 'C');
    } catch (_) {
      setText(fields.weather, '--');
    }
  };

  const updateBattery = () => {
    if (active) {
      setText(fields.battery, formatMetric(sensors.battery.current, '%', 0, 100));
    }
  };

  const updateClock = () => {
    if (!active) {
      return;
    }
    const twelveHour = hmSetting.getTimeFormat() === 0;

    setText(fields.time, formatTime(sensors.time, twelveHour));
    setText(fields.period, twelveHour ? (sensors.time.hour < 12 ? 'AM' : 'PM') : '');
    setText(fields.date, formatDate(sensors.time));
    // Also refresh daily values at midnight; reads do not activate measurements.
    updateSteps();
    updateWeather();
    updateBattery();
  };

  function subscribe(sensor, event, callback) {
    // Older runtimes without removal support use minute reads instead.
    if (
      typeof sensor.addEventListener !== 'function' ||
      typeof sensor.removeEventListener !== 'function'
    ) {
      return;
    }
    try {
      sensor.addEventListener(event, callback);
      subscriptions.push({ sensor, event, callback });
    } catch (_) {
      /* Minute refresh still supplies the value. */
    }
  }

  function pause() {
    active = false;
    if (timerId !== null) {
      timer.stopTimer(timerId);
    }
    timerId = null;
    subscriptions.splice(0).forEach(({ sensor, event, callback }) => {
      try {
        sensor.removeEventListener(event, callback);
      } catch (_) {
        /* Runtime teardown. */
      }
    });
  }

  return {
    resume() {
      if (destroyed) {
        return;
      }
      if (active) {
        updateWeather(true);
        updateClock();

        return;
      }
      active = true;
      updateWeather(true);
      updateClock();
      subscribe(sensors.steps, hmSensor.event.CHANGE, updateSteps);
      subscribe(sensors.battery, hmSensor.event.CHANGE, updateBattery);
      // Watch-face TIME documents no minute event. Align the documented timer to the minute.
      const second = sensors.time.second;
      const delay = valid(second) && second >= 0 && second < 60 ? (60 - second) * 1000 : 60000;

      timerId = timer.createTimer(delay, 60000, updateClock, {});
    },
    pause,
    destroy() {
      destroyed = true;
      pause();
    }
  };
}

let controller = null;

WatchFace({
  build() {
    const sensors = initializeSensors();

    controller = createController(sensors, createWidgets(sensors));
    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: () => controller.resume(),
      pause_call: () => controller.pause()
    });
    controller.resume();
  },
  onDestroy() {
    if (controller) {
      controller.destroy();
    }
  }
});
