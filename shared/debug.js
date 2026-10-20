// Diagnostic logging adds overhead. Disable for normal use and battery comparisons.
export const DEBUG_LOGS = false;
const startedAt = Date.now();
const counters = {};
let sequence = 0;

export function debugLog(event, details = {}) {
  if (!DEBUG_LOGS) {
    return;
  }
  console.log(
    '[watchstat] ' +
      JSON.stringify({
        seq: ++sequence,
        elapsedMs: Date.now() - startedAt,
        event,
        ...details
      })
  );
}

export function debugCount(name) {
  if (DEBUG_LOGS) {
    counters[name] = (counters[name] || 0) + 1;
  }
}

export function debugSummary(reason, state = {}) {
  debugLog('summary', { reason, counters, ...state });
}
