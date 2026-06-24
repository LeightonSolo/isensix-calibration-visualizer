const CONFIG = {
  WORKER_URL: 'https://flat-tree-380f.leightonsolo.workers.dev',
  API_KEY: 'Aerodrive123!',
  ROLLING_DAYS: 7,

  // Default failure thresholds — max absolute new_offset per sensor type
  // Full type names from iserep1 are used (e.g. "Temp-RE", "Humidity")
  // Edit these here or via the Thresholds panel in the UI
  DEFAULT_THRESHOLDS: {
    'Temp-RE':   1.5,
    'Temp-RM':   1.5,
    'Temp-SC':   3.0,
    'Temp-TC':   2.0,
    'Humidity':  5.0,
    'DiffPressure': 0.05,
    'CO2_A_20':  2,
    'TMC Guardian': 4,
    'TMC ARMS': 4,
  },
};