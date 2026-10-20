/// <reference path="../node_modules/@zeppos/device-types/dist/index.d.ts" />
// Watch-face entry point; UI, sensors and globals use the installed modern SDK types.
declare function WatchFace(options: { build(): void; onDestroy(): void }): void;
