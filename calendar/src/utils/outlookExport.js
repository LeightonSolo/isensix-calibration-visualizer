const STATUS_PREFIXES = {
  tentative: '(Tentative)', ticketed: '(Ticketed)', confirmed: '(C)', booked: '(B)',
};

const JOB_INFO_FIELDS = [
  ['Customer', 'customer'], ['Servers', 'servers'], ['Last calibrated', 'last_calibrated'],
  ['Sensor count', 'sensors'], ['Techs needed', 'num_tech'], ['Main site address', 'site_address'],
  ['Offsites', 'offsites'], ['Main contact', 'main_contact'], ['Other contacts', 'other_contacts'],
  ['Contact notes', 'contact_notes'], ['Credentials needed', 'credentials'],
  ['Airport info', 'airport_info'], ['Emerald Aisle', 'emerald_aisle'],
  ['Previous hotel', 'prev_hotel'], ['Hotel comments', 'hotel_comments'],
  ['Restaurants', 'restaurants'], ['Meters needed', 'meters'], ['O2 sensors', 'o2'],
  ['Server version', 'server_version'], ['Hardware', 'hardware'], ['VPN works', 'vpn_works'],
  ['Comments', 'comments'], ['Report / previous visualizer', 'report'], ['Other notes', 'other_notes'],
];

const text = value => value === null || value === undefined ? '' : String(value).trim();
const compactDate = value => text(value).replaceAll('-', '');

function escapeIcsText(value) {
  return text(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const folded = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (current && bytes + size > 75) {
      folded.push(current);
      current = ` ${character}`;
      bytes = 1 + size;
    } else {
      current += character;
      bytes += size;
    }
  }
  folded.push(current);
  return folded.join('\r\n');
}

function moveDate(isoDate, businessOnly = false) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while (businessOnly && (date.getUTCDay() === 0 || date.getUTCDay() === 6));
  return date.toISOString().slice(0, 10);
}

const displayDate = isoDate => {
  const [year, month, day] = text(isoDate).split('-').map(Number);
  return `${month}/${day}/${year}`;
};

function summarizeDateRanges(dates) {
  const sorted = [...new Set(dates)].sort();
  if (!sorted.length) return '';
  const ranges = [];
  let start = sorted[0];
  let end = start;
  for (const date of sorted.slice(1)) {
    if (date === moveDate(end) || date === moveDate(end, true)) end = date;
    else { ranges.push([start, end]); start = date; end = date; }
  }
  ranges.push([start, end]);
  return ranges.map(([a, b]) => a === b ? displayDate(a) : `${displayDate(a)} - ${displayDate(b)}`).join(', ');
}

function assignmentLines(event, assignments) {
  const byTech = new Map();
  for (const assignment of assignments || []) {
    if (String(assignment.event_id) !== String(event.id)) continue;
    const tech = text(assignment.tech_name);
    if (!tech || tech.toLowerCase() === 'unassigned') continue;
    if (!byTech.has(tech)) byTech.set(tech, []);
    byTech.get(tech).push(assignment.date);
  }
  return [...byTech.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([tech, dates]) => `${tech}: ${summarizeDateRanges(dates)}`);
}

function eventSubject(event) {
  const parts = [STATUS_PREFIXES[text(event.status).toLowerCase()], text(event.title)];
  if (text(event.event_type).toLowerCase() === 'calibration') parts.push('Annual Calibrations');
  if (text(event.ticket_id)) parts.push(`TID: ${text(event.ticket_id)}`);
  return parts.filter(Boolean).join(' ');
}

function eventDescription(event, jobInfo, assignments, jobInfoUrl) {
  const lines = [
    `Job name: ${text(jobInfo?.job_name) || text(event.title)}`,
    `Status: ${text(event.status)}`,
    `Dates: ${displayDate(event.start_date)} - ${displayDate(event.end_date)}`,
  ];
  if (text(event.ticket_id)) lines.push(`Ticket ID: ${text(event.ticket_id)}`);
  const techs = assignmentLines(event, assignments);
  if (techs.length) lines.push('', 'Assigned technicians:', ...techs);
  const info = JOB_INFO_FIELDS.map(([label, key]) => [label, text(jobInfo?.[key])])
    .filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  if (info.length) lines.push('', 'Job information:', ...info);
  if (text(event.notes)) lines.push('', `Event notes: ${text(event.notes)}`);
  if (text(jobInfoUrl)) lines.push('', `Open in Job Info: ${text(jobInfoUrl)}`);
  return lines.join('\n');
}

function escapeHtml(value) {
  return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlValue(value) {
  return text(value).split(/(https?:\/\/[^\s]+)/gi).map(part => {
    if (/^https?:\/\//i.test(part)) {
      const safeUrl = escapeHtml(part);
      return `<a href="${safeUrl}" style="color:#0563c1;text-decoration:underline">${safeUrl}</a>`;
    }
    return escapeHtml(part).replace(/\r\n|\r|\n/g, '<br>');
  }).join('');
}

const htmlSection = title => `<tr><td colspan="2" style="background:#1f4e78;color:#ffffff;`
  + `font-weight:700;padding:7px 9px;border:1px solid #17365d">${escapeHtml(title)}</td></tr>`;

function htmlRow(label, value) {
  if (!text(value)) return '';
  return `<tr><td style="width:155px;background:#d9eaf7;color:#17365d;font-weight:700;`
    + `padding:6px 8px;border:1px solid #b4c7dc;vertical-align:top">${escapeHtml(label)}</td>`
    + `<td style="padding:6px 8px;border:1px solid #d6dce4;vertical-align:top">${htmlValue(value)}</td></tr>`;
}

function eventHtmlDescription(event, jobInfo, assignments, jobInfoUrl) {
  const techs = assignmentLines(event, assignments);
  const rows = [
    '<html><body style="font-family:Segoe UI,Arial,sans-serif;font-size:11pt;color:#202124">',
    '<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:850px">',
    htmlSection('Schedule'),
    htmlRow('Job name', text(jobInfo?.job_name) || text(event.title)),
    htmlRow('Status', text(event.status)),
    htmlRow('Dates', `${displayDate(event.start_date)} - ${displayDate(event.end_date)}`),
    htmlRow('Ticket ID', event.ticket_id),
  ];
  if (techs.length) {
    rows.push(htmlSection('Assigned technicians'));
    for (const tech of techs) {
      const separator = tech.indexOf(':');
      rows.push(htmlRow(tech.slice(0, separator), tech.slice(separator + 1).trim()));
    }
  }
  const infoRows = JOB_INFO_FIELDS.map(([label, key]) => htmlRow(label, jobInfo?.[key])).filter(Boolean);
  if (infoRows.length) rows.push(htmlSection('Job information'), ...infoRows);
  if (text(event.notes)) rows.push(htmlSection('Notes'), htmlRow('Event notes', event.notes));
  if (text(jobInfoUrl)) {
    const safeUrl = escapeHtml(jobInfoUrl);
    rows.push(`<tr><td colspan="2" style="padding:10px 0"><a href="${safeUrl}" style="display:inline-block;`
      + `background:#1f4e78;color:#ffffff;font-weight:700;text-decoration:none;padding:7px 12px;`
      + `border-radius:3px">Open Job Info</a></td></tr>`);
  }
  rows.push('</table></body></html>');
  return rows.join('');
}

function safeFilePart(value) {
  const printable = [...text(value)].filter(character => character.charCodeAt(0) >= 32).join('');
  return printable.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function buildOutlookCalendar({ event, jobInfo, assignments = [], jobInfoUrl = '', now = new Date() }) {
  if (!event?.id || !event?.title || !event?.start_date || !event?.end_date) {
    throw new Error('A saved calendar event with a title and date range is required');
  }
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const categories = ['Isensix', text(event.event_type), text(event.status)].filter(Boolean)
    .map(escapeIcsText).join(',');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Isensix//Calibration Calendar//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:calendar-event-${event.id}@isensix.com`, `DTSTAMP:${timestamp}`,
    `DTSTART;VALUE=DATE:${compactDate(event.start_date)}`,
    `DTEND;VALUE=DATE:${compactDate(moveDate(event.end_date))}`,
    `SUMMARY:${escapeIcsText(eventSubject(event))}`,
    `DESCRIPTION:${escapeIcsText(eventDescription(event, jobInfo, assignments, jobInfoUrl))}`,
    `X-ALT-DESC;FMTTYPE=text/html:${eventHtmlDescription(event, jobInfo, assignments, jobInfoUrl)}`,
    `STATUS:${['confirmed', 'booked'].includes(text(event.status).toLowerCase()) ? 'CONFIRMED' : 'TENTATIVE'}`,
    'TRANSP:OPAQUE', `CATEGORIES:${categories}`,
  ];
  if (text(jobInfo?.site_address)) lines.push(`LOCATION:${escapeIcsText(jobInfo.site_address)}`);
  if (text(jobInfoUrl)) lines.push(`URL:${text(jobInfoUrl)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export function outlookCalendarFilename(event) {
  const parts = [event.start_date, event.title];
  if (text(event.ticket_id)) parts.push(`TID-${event.ticket_id}`);
  return `${parts.map(safeFilePart).filter(Boolean).join('-')}.ics`;
}

export function downloadOutlookCalendar(options) {
  const blobUrl = URL.createObjectURL(new Blob(
    [buildOutlookCalendar(options)], { type: 'text/calendar;charset=utf-8' },
  ));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = outlookCalendarFilename(options.event);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}
