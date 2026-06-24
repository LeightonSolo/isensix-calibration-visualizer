const CONFIG = {
  WORKER_URL: 'https://flat-tree-380f.leightonsolo.workers.dev',
  API_KEY: 'Aerodrive123!',
  ROLLING_DAYS: 7,

  // Default failure thresholds — max absolute new_offset per sensor type
  // Edit these here or via the Thresholds panel in the UI (UI changes persist in localStorage)
  DEFAULT_THRESHOLDS: {
    RE:   1.5,
    HU:   3.0,
    RM:   0.5,
    SC:   1.0,
    TC:   1.0,
    DP:   0.25,
    MPM:  0.5,
  },
};