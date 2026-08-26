import {
  addBusinessDays,
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from 'date-fns';
import { CONFIG } from '../config.js';

const CONFLICT_WINDOW_DAYS = 90;

function mondayOnOrBefore(date) {
  let monday = new Date(date);
  while (monday.getDay() !== 1) monday = addDays(monday, -1);
  return monday;
}

function nextBusinessDay(date) {
  let next = addDays(date, 1);
  while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
  return next;
}

function businessDates(start, duration) {
  return Array.from({ length: duration }, (_, index) =>
    format(addBusinessDays(start, index), 'yyyy-MM-dd')
  );
}

function estimatedDays(job) {
  return Math.max(1, Math.ceil(Number(job?.estimated_days) || 1));
}

function normalizedName(value) {
  return String(value || '').trim().toLowerCase();
}

function jobsByName(jobInfoMap) {
  return new Map(
    Object.values(jobInfoMap || {})
      .filter(job => job?.job_name)
      .map(job => [normalizedName(job.job_name), job])
  );
}

function jobsById(jobInfoMap) {
  return new Map(
    Object.values(jobInfoMap || {})
      .filter(job => job?.id !== null && job?.id !== undefined)
      .map(job => [String(job.id), job])
  );
}

function assignmentNames(job) {
  const primary = String(job.primary_tech || '').trim();
  const canonicalPrimary = CONFIG.TECHNICIANS.find(
    technician => technician.toLowerCase() === primary.toLowerCase()
  );
  if (Number(job.num_tech) === 1 && canonicalPrimary) return [canonicalPrimary];
  return [CONFIG.UNASSIGNED_TECHNICIAN];
}

function activeJob(job) {
  return job.active === null || job.active === undefined || job.active === '' || Number(job.active) === 1;
}

function addBusyDate(busyByTech, techName, date) {
  if (!busyByTech.has(techName)) busyByTech.set(techName, new Set());
  busyByTech.get(techName).add(date);
}

function reserveDates(busyByTech, techNames, dates) {
  techNames.forEach(techName => dates.forEach(date => addBusyDate(busyByTech, techName, date)));
}

function firstAvailableSlot(targetStart, duration, techNames, busyByTech) {
  let start = targetStart;
  while (true) {
    const dates = businessDates(start, duration);
    const occupied = techNames.some(techName =>
      dates.some(date => busyByTech.get(techName)?.has(date))
    );
    if (!occupied) return { start, dates };
    start = nextBusinessDay(start);
  }
}

export function normalizeTentativeCalendar(events, assignments, jobInfoMap) {
  const jobLookup = jobsByName(jobInfoMap);
  const jobIdLookup = jobsById(jobInfoMap);
  const tentativeIds = new Set();
  const normalizedEvents = (events || []).map(event => {
    if (event.isGhost || normalizedName(event.status) !== 'tentative') return event;
    const job = jobIdLookup.get(String(event.job_info_id))
      || jobLookup.get(normalizedName(event.title));
    const start = parseISO(String(event.start_date || ''));
    if (!job || !isValid(start)) return event;

    tentativeIds.add(String(event.id));
    const dates = businessDates(start, estimatedDays(job));
    return { ...event, end_date: dates[dates.length - 1] };
  });

  const assignmentsByEvent = new Map();
  (assignments || []).forEach(assignment => {
    const id = String(assignment.event_id);
    if (!assignmentsByEvent.has(id)) assignmentsByEvent.set(id, []);
    assignmentsByEvent.get(id).push(assignment);
  });

  const untouchedAssignments = (assignments || []).filter(
    assignment => !tentativeIds.has(String(assignment.event_id))
  );
  const normalizedTentativeAssignments = normalizedEvents.flatMap(event => {
    const id = String(event.id);
    if (!tentativeIds.has(id)) return [];
    const job = jobIdLookup.get(String(event.job_info_id))
      || jobLookup.get(normalizedName(event.title));
    const existing = assignmentsByEvent.get(id) || [];
    const techNames = [...new Set(existing.map(a => a.tech_name).filter(Boolean))];
    const assignedTechs = techNames.length ? techNames : assignmentNames(job);
    const dates = businessDates(parseISO(event.start_date), estimatedDays(job));
    return assignedTechs.flatMap(techName =>
      dates.map(date => ({ event_id: event.id, tech_name: techName, date }))
    );
  });

  return {
    events: normalizedEvents,
    assignments: [...untouchedAssignments, ...normalizedTentativeAssignments],
  };
}

export function generateTentativeJobs(
  jobInfoMap,
  realEvents,
  now = new Date(),
  realAssignments = [],
  techEvents = []
) {
  const jobs = Object.values(jobInfoMap || {});
  const busyByTech = new Map();

  (realAssignments || []).forEach(assignment => {
    if (assignment?.tech_name && assignment?.date) {
      addBusyDate(busyByTech, assignment.tech_name, assignment.date);
    }
  });
  (techEvents || []).forEach(event => {
    if (event?.tech_name && event?.date) addBusyDate(busyByTech, event.tech_name, event.date);
  });

  const candidates = jobs.flatMap(job => {
    if (!job?.job_name || !activeJob(job) || !job.last_calibrated) return [];

    const lastCalibrated = parseISO(String(job.last_calibrated));
    if (!isValid(lastCalibrated) || now < addMonths(lastCalibrated, 6)) return [];

    const anniversary = addYears(lastCalibrated, 1);
    const targetStart = mondayOnOrBefore(anniversary);
    const hasConflict = (realEvents || []).some(event =>
      !event.isGhost &&
      (String(event.job_info_id || '') === String(job.id || '')
        || normalizedName(event.title) === normalizedName(job.job_name)) &&
      isValid(parseISO(String(event.start_date || ''))) &&
      Math.abs(differenceInCalendarDays(parseISO(event.start_date), targetStart)) < CONFLICT_WINDOW_DAYS
    );
    if (hasConflict) return [];

    return [{ job, lastCalibrated, targetStart }];
  }).sort((a, b) =>
    a.targetStart - b.targetStart || String(a.job.job_name).localeCompare(String(b.job.job_name))
  );

  return candidates.map(({ job, lastCalibrated, targetStart }) => {
    const duration = estimatedDays(job);
    const techNames = assignmentNames(job);
    const slot = firstAvailableSlot(targetStart, duration, techNames, busyByTech);
    reserveDates(busyByTech, techNames, slot.dates);

    const ghostId = `ghost-job-${job.id ?? job.job_name}`;
    const ghostAssignments = techNames.flatMap(techName =>
      slot.dates.map(date => ({ tech_name: techName, date, event_id: ghostId }))
    );

    return {
      id: ghostId,
      job_info_id: job.id ?? null,
      source_calibration_date: job.last_calibrated,
      title: job.job_name,
      event_type: 'calibration',
      status: 'tentative',
      customer: job.customer ?? null,
      start_date: slot.dates[0],
      end_date: slot.dates[slot.dates.length - 1],
      ticket_id: null,
      notes: `Tentative — based on ${format(lastCalibrated, 'MMM yyyy')} calibration`,
      isGhost: true,
      sourceJobInfo: job,
      ghostAssignments,
    };
  });
}

export function materializeTentativeJob(eventData) {
  const realData = { ...eventData, id: undefined };
  delete realData.isGhost;
  delete realData.sourceJobInfo;
  delete realData.ghostAssignments;
  return realData;
}
