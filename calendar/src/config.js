export const CONFIG = {
  WORKER_URL: 'https://flat-tree-380f.leightonsolo.workers.dev',
  API_KEY: 'U87iy7VynFYLJUDnfUYBJHnRKbRiQO3Z',
  EDITOR_TOKEN_KEY: 'cal_editor_token',
  TECHNICIANS: [
    'Daniel',
    'Leighton',
    'Joey',
    'Fernando',
    'Matt',
    'Bissen',
    'Kyle',
    'Dejan',
  ],
  EVENT_TYPES: ['calibration', 'install', 'upgrade', 'other'],
  EVENT_STATUSES: ['ticketed', 'confirmed', 'booked'],
  TECH_EVENT_TYPES: ['pto', 'holiday', 'jury_duty', 'office', 'other'],
  STATUS_COLORS: {
    ticketed:  { bg: '#1a2e14', fg: '#7ec85a', border: '#3a6e2a' },
    confirmed: { bg: '#0e2340', fg: '#5a9ed5', border: '#2a5e90' },
    booked:    { bg: '#1e1040', fg: '#9a7ae0', border: '#4a3a90' },
  },
  TYPE_COLORS: {
    calibration: null,       // uses status color
    install:     { bg: '#2e1e0a', fg: '#d4882a', border: '#6e4a0a' },
    upgrade:     { bg: '#2e0e0e', fg: '#d46060', border: '#6e2020' },
    other:       { bg: '#1e1e28', fg: '#888899', border: '#3a3a50' },
    pto:         { bg: '#3a0e3a', fg: '#d070d0', border: '#6a2a6a' },
    holiday:     { bg: '#2a0a0a', fg: '#e06060', border: '#6a1a1a' },
    jury_duty:   { bg: '#2a2a0a', fg: '#c0c040', border: '#5a5a1a' },
    office:      { bg: '#0a2a2a', fg: '#40c0c0', border: '#1a5a5a' },
  },
};