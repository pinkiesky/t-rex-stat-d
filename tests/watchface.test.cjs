const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(
  require('node:path').join(__dirname, '../watchface/index.js'),
  'utf8'
);

function boot({ format = 1, debug = false, debugLogs = true } = {}) {
  const logs = [];
  const widgets = [],
    timers = new Map(),
    listeners = new Map();
  let face,
    nextId = 0,
    writes = 0;
  const sensors = {
    TIME: { year: 2026, month: 10, day: 18, hour: 23, minute: 59, second: 45 },
    STEP: { current: 98765 },
    BATTERY: { current: 86 }
  };

  Object.entries(sensors).forEach(([name, sensor]) => {
    sensor.onChange = (callback) => listeners.set(name, callback);
    sensor.offChange = (callback) => {
      assert.equal(listeners.get(name), callback);
      listeners.delete(name);
    };
  });
  sensors.STEP.getCurrent = () => sensors.STEP.current;
  sensors.BATTERY.getCurrent = () => sensors.BATTERY.current;
  for (const [method, field] of Object.entries({
    getFullYear: 'year',
    getMonth: 'month',
    getDate: 'day',
    getHours: 'hour',
    getMinutes: 'minute',
    getSeconds: 'second'
  })) {
    sensors.TIME[method] = () => sensors.TIME[field];
  }
  sensors.TIME.getHourFormat = () => (format === 0 ? 12 : 24);
  const mocks = {
    '@zos/sensor': {
      Time: function () {
        return sensors.TIME;
      },
      Step: function () {
        return sensors.STEP;
      },
      Battery: function () {
        return sensors.BATTERY;
      },
      TIME_HOUR_FORMAT_12: 12
    },
    '@zos/device': { getDeviceInfo: () => ({ deviceName: 'Amazfit T-Rex 3 Pro' }) },
    '@zos/ui': {
      data_type: { WEATHER_CURRENT: 42 },
      widget: {
        TEXT_IMG: 'TEXT_IMG',
        TEXT: 'TEXT',
        FILL_RECT: 'RECT',
        WIDGET_DELEGATE: 'DELEGATE'
      },
      align: { LEFT: 0, RIGHT: 1, CENTER_H: 2, CENTER_V: 3 },
      text_style: { ELLIPSIS: 1 },
      show_level: { ONLY_NORMAL: 1 },
      prop: { MORE: 1 },
      createWidget: (kind, options) => {
        const widget = {
          kind,
          ...options,
          setProperty: (_, patch) => {
            writes++;
            Object.assign(widget, patch);
          }
        };

        widgets.push(widget);

        return widget;
      }
    }
  };
  const context = vm.createContext({
    console: { log: (line) => logs.push(line) },
    Number,
    Math,
    String,
    WatchFace: (value) => {
      face = value;
    },
    modules: mocks,
    setTimeout: (callback, delay) => {
      const id = nextId++;

      timers.set(id, { delay, callback });

      return id;
    },
    clearTimeout: (id) => timers.delete(id)
  });
  const loggerSource = fs
    .readFileSync(require('node:path').join(__dirname, '../shared/debug.js'), 'utf8')
    .replace('export const DEBUG_LOGS = true;', 'const DEBUG_LOGS = ' + debugLogs + ';')
    .replace(/export function /g, 'function ');

  mocks['../shared/debug'] = vm.runInContext(
    '(function () {' + loggerSource + '; return { debugLog, debugCount, debugSummary }; })()',
    context
  );
  // Resolve only explicit imports; no legacy globals are provided to the watch face.
  const executable = source
    .replace("import * as ui from '@zos/ui';", "const ui = modules['@zos/ui'];")
    .replace(/import \{([^}]+)\} from '([^']+)';/g, 'const {$1} = modules["$2"];')
    .replace(/const DEBUG = (true|false);/, 'const DEBUG = ' + debug + ';');

  vm.runInContext(executable, context);

  face.build();

  return {
    logs,
    widgets,
    timers,
    listeners,
    sensors,
    face,
    context,
    writes: () => writes,
    delegate: widgets.find((w) => w.kind === 'DELEGATE'),
    text: (value) => widgets.find((w) => w.text === value),
    tick: () => {
      const [id, scheduled] = [...timers.entries()][0];

      timers.delete(id);
      scheduled.callback();
    }
  };
}

test('minute timer, local midnight rollover, live metrics and unchanged text', () => {
  const app = boot();

  assert.ok(app.text('23:59'));
  assert.ok(app.text('sun'));
  assert.ok(app.text('OCT 18'));
  assert.ok(app.text('98,765'));
  assert.ok(app.widgets.find((widget) => widget.type === 42));
  assert.ok(app.text('bat'));
  assert.ok(app.text('86%'));
  assert.equal(app.timers.size, 1);
  assert.equal([...app.timers.values()][0].delay, 15000);
  assert.ok(app.text('$ stat -d trex3pro'));
  const before = app.writes(),
    count = app.widgets.length;

  app.tick();
  assert.equal(app.writes(), before);
  Object.assign(app.sensors.TIME, { day: 19, hour: 0, minute: 0, second: 0 });
  app.sensors.STEP.current = 0;
  app.tick();
  assert.ok(app.text('00:00'));
  assert.ok(app.text('mon'));
  assert.ok(app.text('OCT 19'));
  assert.ok(app.text('0'));
  app.sensors.STEP.current = 12345;
  app.listeners.get('STEP')();
  assert.ok(app.text('12,345'));
  assert.equal(app.widgets.length, count);
});

test('12-hour midnight/noon and leap-day date formatting', () => {
  const app = boot({ format: 0 });

  assert.ok(app.text('11:59'));
  Object.assign(app.sensors.TIME, { hour: 0, minute: 0 });
  app.tick();
  assert.ok(app.text('12:00'));
  app.sensors.TIME.hour = 12;
  app.tick();
  assert.ok(app.text('12:00'));
  Object.assign(app.sensors.TIME, { year: 2028, month: 2, day: 29 });
  app.tick();
  assert.ok(app.text('tue'));
  assert.ok(app.text('FEB 29'));
});

test('pause/resume and destruction cancel work, including timer handle zero', () => {
  const app = boot(),
    oldTick = [...app.timers.values()][0].callback;

  app.delegate.pause_call();
  assert.equal(app.timers.size, 0);
  assert.equal(app.listeners.size, 0);
  const before = app.writes();

  app.sensors.TIME.hour = 8;
  oldTick();
  assert.equal(app.writes(), before);
  app.delegate.resume_call();
  assert.ok(app.text('08:59'));
  app.delegate.resume_call();
  assert.equal(app.timers.size, 1);
  assert.equal(app.listeners.size, 2);
  app.face.onDestroy();
  assert.equal(app.timers.size, 0);
  assert.equal(app.listeners.size, 0);
  app.delegate.resume_call();
  assert.equal(app.timers.size, 0);
});

test('missing step and battery readings show placeholders', () => {
  const app = boot();

  app.sensors.STEP.current = NaN;
  app.sensors.BATTERY.current = NaN;
  app.delegate.pause_call();
  app.delegate.resume_call();
  assert.equal(app.widgets.filter((w) => w.text === '--').length, 2);
});

test('all text boxes stay inside circular screen; no animated overflow or extra sensors', () => {
  const app = boot();

  for (const widget of app.widgets.filter((w) => w.kind === 'TEXT')) {
    for (const x of [widget.x, widget.x + widget.w]) {
      for (const y of [widget.y, widget.y + widget.h]) {
        assert.ok(Math.hypot(x - 240, y - 240) < 240);
      }
    }
    assert.equal(widget.text_style, 1);
    assert.equal(widget.show_level, 1);
  }
  assert.deepEqual([...app.listeners.keys()].sort(), ['BATTERY', 'STEP']);
});

test('manifest selects API 3 minimum and API 4.2 target', () => {
  const manifest = require('../app.json');

  assert.deepEqual(manifest.runtime.apiVersion, {
    compatible: '3.0.0',
    target: '4.2.0',
    minVersion: '3.0.0'
  });
  assert.equal(manifest.app.appType, 'watchface');
  const target = manifest.targets['480x480-amazfit-t-rex-3-pro-48-mm'];

  assert.equal(target.designWidth, 480);
  assert.equal(target.platforms[0].deviceSource, 10551552);
});

test('current-temperature TEXT_IMG binding is not overwritten by application refreshes', () => {
  const app = boot();
  const weather = app.widgets.find((widget) => widget.type === 42);

  assert.equal(weather.kind, 'TEXT_IMG');
  assert.equal(weather.font_array.length, 10);
  for (const asset of [
    ...weather.font_array,
    weather.negative_image,
    weather.unit_en,
    weather.imperial_unit_en
  ]) {
    assert.ok(
      fs.existsSync(
        require('node:path').join(__dirname, '../assets/480x480-amazfit-t-rex-3-pro-48-mm', asset)
      )
    );
  }
  assert.equal(Object.hasOwn(weather, 'text'), false);
  weather.setProperty = () => assert.fail('Application must not overwrite the system binding');
  app.tick();
  app.delegate.pause_call();
  app.delegate.resume_call();
  // The mock checks options only; native temperature rendering still needs a simulator/device trial.
});

test('battery changes, zero charge, missing data, and resume refresh', () => {
  const app = boot();

  app.sensors.BATTERY.current = 85;
  app.listeners.get('BATTERY')();
  assert.ok(app.text('85%'));
  const before = app.writes();

  app.listeners.get('BATTERY')();
  assert.equal(app.writes(), before);
  app.sensors.BATTERY.current = 0;
  app.listeners.get('BATTERY')();
  assert.ok(app.text('0%'));
  app.sensors.BATTERY.current = 101;
  app.listeners.get('BATTERY')();
  assert.ok(app.text('--'));
  app.delegate.pause_call();
  assert.equal(app.listeners.has('BATTERY'), false);
  app.sensors.BATTERY.current = 64;
  app.delegate.resume_call();
  assert.ok(app.text('64%'));
});

test('debug overlay is opt-in and leaves text, timers and subscriptions unchanged', () => {
  const normal = boot();
  const debug = boot({ debug: true });

  const textBoxes = (app) =>
    app.widgets
      .filter((w) => w.kind === 'TEXT')
      .map(({ x, y, w, h, text }) => ({ x, y, w, h, text }));

  assert.equal(normal.widgets.filter((w) => w.kind === 'RECT').length, 1);
  assert.ok(debug.widgets.filter((w) => w.kind === 'RECT').length > 50);
  assert.deepEqual(textBoxes(debug), textBoxes(normal));
  assert.equal(debug.timers.size, normal.timers.size);
  assert.equal(debug.listeners.size, normal.listeners.size);
  const count = debug.widgets.length;

  debug.tick();
  assert.equal(debug.widgets.length, count);
});

test('text positions and dimensions use shared symbol-grid edges', () => {
  const app = boot();

  const onEdge = (value, origin, cell) =>
    Math.abs((value - origin) / cell - Math.round((value - origin) / cell)) <= 0.5 / cell + 1e-9;

  for (const widget of app.widgets.filter((w) => w.kind === 'TEXT')) {
    assert.ok(onEdge(widget.x, 64, 18.4));
    assert.ok(onEdge(widget.x + widget.w, 64, 18.4));
    assert.ok(onEdge(widget.y, 80, 31));
    assert.ok(onEdge(widget.y + widget.h + 2, 80, 31));
  }
  assert.equal(
    app.text('temp').x + app.text('temp').w,
    app.widgets.find((widget) => widget.type === 42).x
  );
});

test('diagnostic logs describe activity without adding timers or writes', () => {
  const app = boot();
  const quiet = boot({ debugLogs: false });

  assert.equal(quiet.logs.length, 0);
  assert.equal(app.timers.size, quiet.timers.size);
  assert.equal(app.writes(), quiet.writes());
  app.tick();
  quiet.tick();
  assert.equal(app.writes(), quiet.writes());
  app.listeners.get('STEP')();
  app.delegate.pause_call();
  const events = app.logs.map((line) => JSON.parse(line.slice('[watchstat] '.length)));

  for (const event of [
    'watchface.build.start',
    'ui.create',
    'ui.text.write',
    'ui.text.unchanged',
    'timer.schedule',
    'timer.tick',
    'sensor.subscribe.ok',
    'sensor.change',
    'lifecycle.pause',
    'timer.cancel',
    'sensor.unsubscribe.ok'
  ]) {
    assert.ok(
      events.some((entry) => entry.event === event),
      event
    );
  }
  const summary = events.filter((entry) => entry.event === 'summary').at(-1);

  assert.equal(summary.reason, 'pause');
  assert.equal(summary.timerId, null);
  assert.equal(summary.trackedSubscriptions, 0);
  assert.equal(summary.counters.timerTicks, 1);
  assert.equal(summary.counters.subscriptionsAdded, summary.counters.subscriptionsRemoved);
  assert.equal(app.timers.size, 0);
  app.face.onDestroy();
  assert.ok(app.logs.some((line) => line.includes('watchface.destroy')));
});
