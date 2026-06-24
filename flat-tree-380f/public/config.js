const CONFIG = {
  WORKER_URL: 'https://flat-tree-380f.leightonsolo.workers.dev',
  API_KEY: 'Aerodrive123!',
  ROLLING_DAYS: 7,

  // Default failure thresholds — max absolute new_offset per sensor type
  // Edit these here or via the Thresholds panel in the UI (UI changes persist in localStorage)
  DEFAULT_THRESHOLDS: {
    RE:   1.5,
    HU:   5.0,
    RM:   1.5,
    SC:   3.0,
    TC:   2.0,
    DP:   0.05,
    CO2_A_20:  2,
  },
};