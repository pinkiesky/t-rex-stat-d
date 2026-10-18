/// <reference path="../node_modules/@zeppos/device-types/dist/index.d.ts" />
// Narrow declarations for legacy watch-face APIs plus the experimental TTF option.
// The installed device-types package describes @zos application modules instead.
interface FaceSensor {
  current?: number;
  getForecastWeather?(): {
    forecastData: { count: number; data: Array<{ low: number; high: number }> };
  };
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  addEventListener(event: number, callback: () => void): void;
  removeEventListener(event: number, callback: () => void): void;
}
declare const hmSensor: {
  id: { TIME: number; STEP: number; WEATHER: number; BATTERY: number };
  event: { CHANGE: number };
  createSensor(id: number): FaceSensor;
};
interface FaceTextOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: number;
  text_size: number;
  /** Experimental: device-app font option, not documented for legacy watch faces. */
  font: string;
  char_space: number;
  align_h: number;
  align_v: number;
  text_style: number;
  show_level: number;
}
interface FaceRectOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  show_level: number;
}
declare const hmUI: {
  widget: { TEXT: number; FILL_RECT: number; WIDGET_DELEGATE: number };
  align: { LEFT: number; RIGHT: number; CENTER_H: number; CENTER_V: number };
  prop: { MORE: number };
  text_style: { ELLIPSIS: number };
  show_level: { ONLY_NORMAL: number };
  createWidget(
    id: number,
    options:
      | FaceTextOptions
      | FaceRectOptions
      | {
          resume_call: () => void;
          pause_call: () => void;
        }
  ): { setProperty(id: number, value: { text: string }): void };
};
declare const hmSetting: { getTimeFormat(): number };
declare const timer: {
  createTimer(delay: number, repeat: number, callback: () => void, option: object): number;
  stopTimer(id: number): void;
};
declare function WatchFace(options: { build(): void; onDestroy(): void }): void;
