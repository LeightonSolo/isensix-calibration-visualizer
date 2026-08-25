import { eachDayOfInterval, format, isValid, parseISO } from 'date-fns';
import { CONFIG } from '../config.js';

function isUnassignedName(value) {
  return String(value || '').trim().toLowerCase() ===
    CONFIG.UNASSIGNED_TECHNICIAN.toLowerCase();
}

export function withoutAutomaticUnassigned(assignments) {
  return (assignments || []).filter(assignment => !isUnassignedName(assignment?.tech_name));
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
