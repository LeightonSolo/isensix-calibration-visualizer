/** Returns readable labels for technician time-off and office events. */

const TECH_EVENT_LABELS = {
  pto: 'PTO',
  holiday: 'Holiday',
  office: 'Office',
  jury_duty: 'Jury Duty',
  software: 'Software',
  other: 'Other',
};

export function techEventLabel(eventType) {
  const value = String(eventType || '').trim();
  return TECH_EVENT_LABELS[value.toLowerCase()]
    || value.replaceAll('_', ' ');
}
