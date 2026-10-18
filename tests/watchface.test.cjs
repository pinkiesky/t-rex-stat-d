const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(
  require('node:path').join(__dirname, '../watchface/index.js'),
  'utf8'
);

function boot({ weather = true, format = 1, debug = false } = {}) {
  const widgets = [],
    timers = new Map(),
    listeners = new Map();
  let face,
    nextId = 0,
    writes = 0;
  const sensors = {
    TIME: { year: 2026, month: 10, day: 18, hour: 23, minute: 59, second: 45 },
    STEP: { current: 98765 },
    WEATHER: {
      reads: 0,
      forecast: { forecastData: { count: 1, data: [{ low: 12, high: 18 }] } },
      getForecastWeather() {
        this.reads++;

        return this.forecast;
      }
    },
    BATTERY: { current: 86 }
  };

  Object.entries(sensors).forEach(([name, sensor]) => {
    sensor.addEventListener = (event, callback) => listeners.set(name, callback);
    sensor.removeEventListener = (event, callback) => {
      assert.equal(listeners.get(name), callback);
      listeners.delete(name);
    };
  });
  const context = vm.createContext({
    Number,
    Math,
    String,
    WatchFace: (value) => {
      face = value;
    },
    hmSetting: { getTimeFormat: () => format },
    hmSensor: {
      id: { TIME: 'TIME', STEP: 'STEP', WEATHER: 'WEATHER', BATTERY: 'BATTERY' },
      event: { CHANGE: 'CHANGE' },
      createSensor: (id) => {
        if (id === 'WEATHER' && !weather) {
          throw Error('unsupported');
        }

        return sensors[id];
      }
    },
    hmUI: {
      widget: { TEXT: 'TEXT', FILL_RECT: 'RECT', WIDGET_DELEGATE: 'DELEGATE' },
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
    },
    timer: {
      createTimer: (delay, repeat, callback) => {
        const id = nextId++;

        timers.set(id, { delay, repeat, callback });

        return id;
      },
      stopTimer: (id) => timers.delete(id)
    }
  });

  vm.runInContext(
    source.replace(/const DEBUG = (true|false);/, 'const DEBUG = ' + debug + ';'),
    context
  );
  face.build();

  return {
    widgets,
    timers,
    listeners,
    sensors,
    face,
    context,
    writes: () => writes,
    delegate: widgets.find((w) => w.kind === 'DELEGATE'),
    text: (value) => widgets.find((w) => w.text === value),
    tick: () => [...timers.values()][0].callback()
  };
}

test('minute timer, local midnight rollover, live metrics and unchanged text', () => {
  const app = boot();

  assert.ok(app.text('23:59'));
  assert.ok(app.text('SUN OCT 18'));
  assert.ok(app.text('98,765'));
  assert.ok(app.text('12/18C'));
  assert.ok(app.text('/dev/btr0'));
  assert.ok(app.text('86%'));
  assert.equal(app.text('heart_rate'), undefined);
  assert.equal(app.timers.size, 1);
  assert.equal([...app.timers.values()][0].delay, 15000);
  assert.equal([...app.timers.values()][0].repeat, 60000);
  const before = app.writes(),
    count = app.widgets.length;

  app.tick();
  assert.equal(app.writes(), before);
  Object.assign(app.sensors.TIME, { day: 19, hour: 0, minute: 0, second: 0 });
  app.sensors.STEP.current = 0;
  app.tick();
  assert.ok(app.text('00:00'));
  assert.ok(app.text('MON OCT 19'));
  assert.ok(app.text('0'));
  app.sensors.STEP.current = 12345;
  app.listeners.get('STEP')();
  assert.ok(app.text('12,345'));
  assert.equal(app.widgets.length, count);
});

test('12-hour midnight/noon and leap-day date formatting', () => {
  const app = boot({ format: 0 });

  assert.ok(app.text('11:59'));
  assert.ok(app.text('PM'));
  Object.assign(app.sensors.TIME, { hour: 0, minute: 0 });
  app.tick();
  assert.ok(app.text('12:00'));
  assert.ok(app.text('AM'));
  app.sensors.TIME.hour = 12;
  app.tick();
  assert.ok(app.text('PM'));
  Object.assign(app.sensors.TIME, { year: 2028, month: 2, day: 29 });
  app.tick();
  assert.ok(app.text('TUE FEB 29'));
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

test('missing metrics and unsupported optional sensors', () => {
  const app = boot();

  app.sensors.STEP.current = NaN;
  app.sensors.WEATHER.forecast = null;
  app.sensors.BATTERY.current = NaN;
  app.delegate.pause_call();
  app.delegate.resume_call();
  assert.equal(app.widgets.filter((w) => w.text === '--').length, 3);
  const withoutWeather = boot({ weather: false });

  assert.equal(withoutWeather.text('/dev/forecast'), undefined);
  assert.ok(withoutWeather.text('98,765'));
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

test('manifest selects the legacy API family required by watch-face globals', () => {
  const manifest = require('../app.json');

  assert.deepEqual(manifest.runtime.apiVersion, {
    compatible: '1.0.0',
    target: '1.0.1',
    minVersion: '1.0.0'
  });
  assert.equal(manifest.app.appType, 'watchface');
  const target = manifest.targets['480x480-amazfit-t-rex-3-pro-48-mm'];

  assert.equal(target.designWidth, 480);
  assert.equal(target.platforms[0].deviceSource, 10551552);
});

test('weather uses cached forecast, refreshes infrequently and on resume, handles missing data', () => {
  const app = boot();

  assert.equal(app.sensors.WEATHER.reads, 1);
  app.tick();
  assert.equal(app.sensors.WEATHER.reads, 1);
  Object.assign(app.sensors.TIME, { hour: 0, minute: 0, day: 19 });
  app.sensors.WEATHER.forecast.forecastData.data[0] = { low: -5, high: 0 };
  app.tick();
  assert.ok(app.text('-5/0C'));
  assert.equal(app.sensors.WEATHER.reads, 2);
  app.sensors.TIME.minute = 29;
  app.tick();
  assert.equal(app.sensors.WEATHER.reads, 2);
  app.sensors.TIME.minute = 30;
  app.tick();
  assert.equal(app.sensors.WEATHER.reads, 3);
  app.delegate.pause_call();
  app.sensors.WEATHER.forecast.forecastData.count = 0;
  app.delegate.resume_call();
  assert.ok(app.text('--'));
  assert.equal(app.sensors.WEATHER.reads, 4);
  app.sensors.WEATHER.getForecastWeather = () => {
    throw Error('missing cache');
  };
  app.delegate.pause_call();
  app.delegate.resume_call();
  assert.ok(app.text('--'));
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
  assert.equal(app.text('/dev/forecast').x + app.text('/dev/forecast').w, app.text('12/18C').x);
});
