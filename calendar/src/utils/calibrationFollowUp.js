/** Derives due and overdue calibration follow-up rows from Job Info and calendar events. */
import { addDays, addYears, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

const SCHEDULED_STATUSES = new Set(['ticketed', 'confirmed', 'booked']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function activeJob(job) {
  return job.active === null || job.active === undefined || job.active === '' || Number(job.active) === 1;
}

function dateValue(value) {
  const parsed = parseISO(String(value || ''));
  return isValid(parsed) ? parsed : null;
}

function eventMatchesJob(event, job) {
  return String(event.job_info_id || '') === String(job.id || '')
    || normalized(event.title) === normalized(job.job_name);
}

function eventDate(event) {
  return dateValue(event.start_date || event.end_date);
}

export function buildCalibrationFollowUpRows(jobInfoMap, events = [], now = new Date(), dueSoonDays = 60) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const soonThrough = addDays(today, dueSoonDays);

  return Object.values(jobInfoMap || {}).flatMap(job => {
    if (!job?.job_name || !activeJob(job)) return [];
    const lastCalibrated = dateValue(job.last_calibrated);
    if (!lastCalibrated) return [];

    const dueDate = addYears(lastCalibrated, 1);
    if (dueDate > soonThrough) return [];

    const matchingEvents = (events || [])
      .filter(event => !event.isGhost
        && normalized(event.event_type) === 'calibration'
        && eventMatchesJob(event, job))
      .sort((a, b) => (eventDate(b) || 0) - (eventDate(a) || 0));
    const upcomingEvents = matchingEvents.filter(event => {
      const date = dateValue(event.end_date || event.start_date);
      return date && date >= today;
    });
    const scheduledEvent = upcomingEvents.find(event => SCHEDULED_STATUSES.has(normalized(event.status)));
    if (scheduledEvent) return [];

    const nextEvent = upcomingEvents[0] || null;
    const overdue = dueDate < today;
    const dueDateText = format(dueDate, 'yyyy-MM-dd');
    const daysOverdue = overdue ? differenceInCalendarDays(today, dueDate) : 0;
    const followUpStatus = overdue ? 'overdue' : nextEvent ? 'needs confirmation' : 'due soon';

    return [{
      ...(nextEvent || {}),
      id: nextEvent?.id ?? null,
      job_info_id: job.id ?? null,
      title: job.job_name,
      event_type: 'calibration',
      status: nextEvent?.status || 'tentative',
      customer: job.customer ?? null,
      start_date: nextEvent?.start_date || dueDateText,
      end_date: nextEvent?.end_date || dueDateText,
      ticket_id: nextEvent?.ticket_id || null,
      notes: nextEvent?.notes || null,
      follow_up_status: followUpStatus,
      due_date: dueDateText,
      days_overdue: daysOverdue,
      last_calibrated: job.last_calibrated,
      next_event_date: nextEvent?.start_date || null,
      _row_id: nextEvent?.id ?? `follow-up-${job.id ?? job.job_name}`,
      _techs: job.primary_tech ? [job.primary_tech] : [],
      _source_event: nextEvent,
    }];
  }).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title));
}

export { SCHEDULED_STATUSES };
