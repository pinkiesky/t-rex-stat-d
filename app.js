import { debugLog, debugSummary } from './shared/debug';

App({
  globalData: {},
  onCreate() {
    debugLog('app.create');
  },

  onDestroy() {
    debugLog('app.destroy');
    debugSummary('app.destroy');
  }
});
