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
    'DiffPress': 0.05,
    'CO2_A_20':  2,
    'TMC Guardian': 4,
    'TMC ARMS': 4,
  },
  DEFAULT_TYPE_COLORS: {
  'Humidity':    { bg: '#0e2340', fg: '#69b0e9' },
  'Temp-RE':     { bg: '#494949', fg: '#cacaca' },
  'Temp-RM':     { bg: '#353535', fg: '#fff99f' },
  'Temp-SC':     { bg: '#1e1040', fg: '#b195ee' },
  'Temp-TC':     { bg: '#440000', fg: '#ff5757' },
  'DiffPress':   { bg: '#0f3b02', fg: '#9aff96' },
  'Binary':      { bg: '#3a3900', fg: '#ebeb00' },
  'Oxygen':      { bg: '#222222', fg: '#ffffff' },
  'CO2':         { bg: '#3d2100', fg: '#ffbf48' },
  'CO2_A_20':    { bg: '#3d2100', fg: '#ffbf48' },
  'TMC Guardian':{ bg: '#3a0035', fg: '#fc9cff' },
  'TMC ARMS':    { bg: '#3a0035', fg: '#fc9cff' },
},
};