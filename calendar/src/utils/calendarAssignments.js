import { addBusinessDays, eachDayOfInterval, format, isValid, parseISO } from 'date-fns';
import { CONFIG } from '../config.js';

function isUnassignedName(value) {
  return String(value || '').trim().toLowerCase() ===
    CONFIG.UNASSIGNED_TECHNICIAN.toLowerCase();
}

export function withoutAutomaticUnassigned(assignments) {
  return (assignments || []).filter(assignment => !isUnassignedName(assignment?.tech_name));
}

export function withinEventDateRange(assignments, startDate, endDate) {
  return (assignments || []).filter(assignment => {
    const date = String(assignment?.date || '');
    return date >= startDate && date <= endDate;
  });
}

export function businessDateStrings(startDate, endDate) {
  const start = parseISO(String(startDate || ''));
  const end = parseISO(String(endDate || ''));
  if (!isValid(start) || !isValid(end) || end < start) return [];
  return eachDayOfInterval({ start, end })
    .filter(date => date.getDay() !== 0 && date.getDay() !== 6)
    .map(date => format(date, 'yyyy-MM-dd'));
}

export function estimatedBusinessEndDate(startDate, estimatedDays) {
  const start = parseISO(String(startDate || ''));
  if (!isValid(start)) return startDate;
  const duration = Math.max(1, Math.ceil(Number(estimatedDays) || 1));
  return format(addBusinessDays(start, duration - 1), 'yyyy-MM-dd');
}

export function buildBusyDatesByTech(assignments, techEvents, excludedEventId = null) {
  const busy = new Map();
  const reserve = (techName, date) => {
    if (!techName || !date || isUnassignedName(techName)) return;
    if (!busy.has(techName)) busy.set(techName, new Set());
    busy.get(techName).add(date);
  };
  (assignments || []).forEach(assignment => {
    if (excludedEventId !== null
      && String(assignment.event_id) === String(excludedEventId)) return;
    reserve(assignment.tech_name, assignment.date);
  });
  (techEvents || []).forEach(event => reserve(event.tech_name, event.date));
  return busy;
}

export function fillAssignedTechnicians(techDates, startDate, endDate, busyDatesByTech) {
  const dates = businessDateStrings(startDate, endDate);
  const next = { ...techDates };
  Object.entries(techDates || {}).forEach(([techName, assignedDates]) => {
    if (!(assignedDates instanceof Set) || assignedDates.size === 0) return;
    const busyDates = busyDatesByTech?.get(techName) || new Set();
    next[techName] = new Set(dates.filter(date => !busyDates.has(date)));
  });
  return next;
}

export function withAutomaticUnassigned(events, assignments, visibleDates) {
  const realAssignments = withoutAutomaticUnassigned(assignments);
  const assignedDates = new Set(
    realAssignments.map(assignment => `${String(assignment.event_id)}\u0000${assignment.date}`)
  );
  const visibleDateSet = visibleDates ? new Set(visibleDates) : null;

  const unassigned = (events || []).flatMap(event => {
    const start = parseISO(String(event.start_date || ''));
    const end = parseISO(String(event.end_date || ''));
    if (!isValid(start) || !isValid(end) || end < start) return [];

    return eachDayOfInterval({ start, end })
      .filter(date => date.getDay() !== 0 && date.getDay() !== 6)
      .map(date => format(date, 'yyyy-MM-dd'))
      .filter(date => !visibleDateSet || visibleDateSet.has(date))
      .filter(date => !assignedDates.has(`${String(event.id)}\u0000${date}`))
      .map(date => ({
        event_id: event.id,
        tech_name: CONFIG.UNASSIGNED_TECHNICIAN,
        date,
        isAutomaticUnassigned: true,
      }));
  });

  return [...realAssignments, ...unassigned];
}
