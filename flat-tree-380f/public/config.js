/** Defines shared Worker access, dashboard messages, rolling-window defaults, thresholds, and sensor colors. */
const CONFIG = {
  WORKER_URL: 'https://flat-tree-380f.leightonsolo.workers.dev',
  API_KEY: 'U87iy7VynFYLJUDnfUYBJHnRKbRiQO3Z', //public, both ends secured
  ROLLING_DAYS: 7,
  DASHBOARD_MESSAGE_INTERVAL_MS: 1 * 60 * 1000, //1 minutes
  DASHBOARD_PRIORITY_MESSAGE_INTERVAL_MS: 5 * 60 * 1000, //5 minutes
  DASHBOARD_EASTER_EGG_DAILY_CHANCE: 0.5, //At most one easter egg shown per local day; 0.5 averages one every two days
  DASHBOARD_EASTER_EGGS: [
    { id: '1', text: '"I don\'t care" - Matt' },
    { id: '2', text: '"OPA!" - Dejan' },
    { id: '3', text: '"Do it." - Fernando' },
    { id: '4', text: '"I love talking to people!" - Bissen' },
    { id: '5', text: '"How ya doin\'"" - Fernando' },
    { id: '6', text: 'Brandon? Brendan? Brendon? No idea how its spelled.' },


    { id: 'calibration-joke', text: 'Make sure you calibrate correctly, or else you\'ll face DWYER consequences.', },
    { id: 'calibration-joke2', text: '"I thought my meter was broken, but it was just a Fluke."', },


  ],
  DASHBOARD_MESSAGES: [
    { id: 'tip-refresh', text: 'If data looks outdated, view the Isensix server, then refresh the dashboard.' },
    { id: 'calibration-tip2', text: 'Turn on Auto-refresh to see the latest calibration data every 3 minutes.'},
    { id: 'tip-rolling-window', text: 'The "Rolling Days" under Settings sets how far back to check for calibration.' },
    { id: 'tip-disabled', text: 'Disabled sensors are hidden unless you turn on Show disabled. ↓' },
    { id: 'tip-breakdown', text: 'In Zones or Types, click a row to see the sensors in that breakdown.' },
    { id: 'tip-search', text: 'You can search the tables by sensor name, zone, CP address, or access point.  ↓' },
    { id: 'tip-servers', text: 'Click on a server above to view its full server overview.' },
    { id: 'tip-disabledSensors', text: 'Sensors disabled after calibration increase the calibrated count but not job progress.' },
    { id: 'tip-jobInfo', text: 'Update Job Info and click save if there\'s anything worth knowing about this job!  ->' },

    { id: 'birthday-leighton', text: 'Happy birthday, Leighton!!!', annualDate: '09-17', priority: true },
    { id: 'birthday-joey', text: 'Happy birthday, Joey!!!', annualDate: '09-05', priority: true },
    { id: 'birthday-fer', text: 'Happy birthday, Fernando!!!', annualDate: '08-24', priority: true },
    { id: 'birthday-dejan', text: 'Happy birthday, Dejan!!!', annualDate: '05-04', priority: true },
    { id: 'birthday-matt', text: 'Happy birthday, Matt!!!', annualDate: '03-19', priority: true },
    { id: 'birthday-daniel', text: 'Happy birthday, Daniel!!!', annualDate: '09-06', priority: true },     
    { id: 'birthday-bissen', text: 'Happy birthday, Bissen!!!', annualDate: '01-01', priority: true },
    { id: 'birthday-brendon', text: 'Happy birthday, Brendon!!!', annualDate: '04-07', priority: true },



    // Example birthday: { id: 'birthday-name', text: 'Happy birthday, Name!', annualDate: 'MM-DD', priority: true }
    // Example job update: { id: 'job-update', text: '...', startsOn: 'YYYY-MM-DD', endsOn: 'YYYY-MM-DD', priority: true }
  ],
  DASHBOARD_PROGRESS_MILESTONES: [
    { id: 'calibrated-25', type: 'percent', value: 25, text: '25% complete!', celebrate: true },
    { id: 'calibrated-50', type: 'percent', value: 50, text: 'Halfway there, 50% complete!', celebrate: true },
    { id: 'calibrated-75', type: 'percent', value: 75, text: '75% complete, the end is in sight!', celebrate: true },
    { id: 'calibrated-count-100', type: 'calibrated-count', value: 100, text: '100 sensors calibrated!' },
    { id: 'server-complete', type: 'server-complete', text: 'Server {server} is complete!' },
  ],

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
  'Humidity':    { bg: '#062653', fg: '#dfedff' },
  'Temp-RE':     { bg: '#2c2c2c', fg: '#b4d7ff' },
  'Temp-RM':     { bg: '#2c2c2c', fg: '#fffcd7' },
  'Temp-SC':     { bg: '#1e1040', fg: '#c6abff' },
  'Temp-TC':     { bg: '#440000', fg: '#ff8f8f' },
  'DiffPress':   { bg: '#0f3b02', fg: '#9aff96' },
  'Binary':      { bg: '#3a3900', fg: '#ebeb00' },
  'MPM':         { bg: '#3a3900', fg: '#ebeb00' },
  'Oxygen':      { bg: '#222222', fg: '#ffffff' },
  'CO2':         { bg: '#3d2100', fg: '#ffbf48' },
  'CO2_A_20':    { bg: '#3d2100', fg: '#ffbf48' },
  'TMC Guardian':{ bg: '#3a0035', fg: '#fdb5ff' },
  'TMC ARMS':    { bg: '#3a0035', fg: '#fdb5ff' },
  },

  TECHNICIANS: [
    'Leighton',
    'Joey',
    'Fernando',
    'Daniel',
    'Deyan',
    'Dejan',
    'Bissen',
    'Brendon',
    'Matt',
  ],
};
