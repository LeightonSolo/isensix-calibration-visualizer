/** Builds an Excel-compatible offline snapshot of the technician calendar. */
import { format } from 'date-fns';

export const CALENDAR_SNAPSHOT_KEY = 'isensix_calendar_snapshot_v1';

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function csvCell(value) {
  const escaped = text(value).replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function assignmentNames(eventId, assignments) {
  return [...new Set((assignments || [])
    .filter(row => String(row.event_id) === String(eventId))
    .map(row => row.person_name || row.tech_name)
    .filter(Boolean))].join(', ');
}

export function buildCalendarExportRows({ events = [], assignments = [], techEvents = [] } = {}) {
  const jobRows = events.map(event => ({
    record_type: event.isGhost ? 'Projected job' : 'Scheduled job',
    start_date: event.start_date,
    end_date: event.end_date,
    technician: assignmentNames(event.id, assignments),
    event_type: event.event_type,
    status: event.isGhost ? 'tentative' : event.status,
    title: event.title,
    customer: event.customer,
    ticket_id: event.ticket_id,
    notes: event.notes,
    job_info_id: event.job_info_id,
    updated_at: event.updated_at,
    updated_by: event.updated_by,
  }));

  const unavailableRows = techEvents.map(event => ({
    record_type: 'Unavailable time',
    start_date: event.date,
    end_date: event.date,
    technician: event.person_name || event.tech_name,
    event_type: event.event_type,
    status: '',
    title: event.event_type,
    customer: '',
    ticket_id: '',
    notes: event.notes,
    job_info_id: '',
    updated_at: event.updated_at,
    updated_by: event.updated_by,
  }));

  return [...jobRows, ...unavailableRows].sort((a, b) =>
    `${a.start_date}|${a.technician}|${a.title}`.localeCompare(
      `${b.start_date}|${b.technician}|${b.title}`
    )
  );
}

export function downloadCalendarExport(data, now = new Date()) {
  const rows = buildCalendarExportRows(data);
  const columns = [
    'record_type', 'start_date', 'end_date', 'technician', 'event_type',
    'status', 'title', 'customer', 'ticket_id', 'notes', 'job_info_id',
    'updated_at', 'updated_by',
  ];
  const csv = [columns, ...rows.map(row => columns.map(column => row[column]))]
    .map(row => row.map(csvCell).join(','))
    .join('\r\n');
  const blob = new Blob([`\uFEFF${csv}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `isensix-calendar-${format(now, 'yyyy-MM-dd-HHmm')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function readCalendarSnapshot() {
  try {
    const raw = localStorage.getItem(CALENDAR_SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || !Array.isArray(snapshot.events)
      || !Array.isArray(snapshot.assignments) || !Array.isArray(snapshot.techEvents)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export function writeCalendarSnapshot({ events, assignments, techEvents }, savedAt = new Date()) {
  try {
    localStorage.setItem(CALENDAR_SNAPSHOT_KEY, JSON.stringify({
      events, assignments, techEvents, savedAt: savedAt.toISOString(),
    }));
  } catch {
    // A full localStorage should not make a successful server load fail.
  }
}
