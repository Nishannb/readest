export const TELEMETRY_OPT_OUT_KEY = 'readest-telemetry-opt-out';

export const hasOptedOutTelemetry = () => {
  try {
    return localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === 'true';
  } catch {
    return true;
  }
};

// Telemetry removed – stubbed no-op functions
export const captureEvent = (_event: string, _properties?: Record<string, unknown>) => {
  // no-op
};

export const optInTelemetry = () => {
  try {
    localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'false');
  } catch {}
};
export const optOutTelemetry = () => {
  try {
    localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');
  } catch {}
};
