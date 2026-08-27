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
  ['Server version(s)', 'server_version'], ['Hardware', 'hardware'], ['VPN works', 'vpn_works'],
  ['Comments', 'comments'], ['Report / previous visualizer', 'report'], ['Other notes', 'other_notes'],
];

// Outlook does not have access to the calendar's CSS variables, so these fixed
// colors mirror the technician hues used by the app. Each pair meets readable
// contrast in the light fallback; dark-mode alternatives are in EMAIL_STYLES.
const TECH_EMAIL_COLORS = {
  Leighton: { bg: '#e8efff', fg: '#1e54c7', border: '#9db4ec', darkBg: '#172752', darkFg: '#a9c2ff' },
  Fernando: { bg: '#e8f7e7', fg: '#237b1b', border: '#9dce99', darkBg: '#163b18', darkFg: '#9fe296' },
  Daniel: { bg: '#fff8cf', fg: '#6f6400', border: '#d7c85e', darkBg: '#403b12', darkFg: '#f4df68' },
  Joey: { bg: '#f7eddf', fg: '#8a5500', border: '#d2ad70', darkBg: '#3d2c18', darkFg: '#e8b66b' },
  Bissen: { bg: '#f2e9f8', fg: '#7c3998', border: '#c09bd1', darkBg: '#352040', darkFg: '#d9a9ec' },
  Dejan: { bg: '#e1f5f4', fg: '#087b78', border: '#8ccbc7', darkBg: '#103b3a', darkFg: '#7ddbd7' },
  Brendon: { bg: '#f8e5e5', fg: '#a22e2e', border: '#dda0a0', darkBg: '#431e1e', darkFg: '#f2a2a2' },
  Matt: { bg: '#f0f2f0', fg: '#374a37', border: '#b8c0b8', darkBg: '#303530', darkFg: '#d2ddd2' },
};

const SECTION_COLORS = {
  schedule: { bg: '#334e68', border: '#243b53' },
  technicians: { bg: '#28666e', border: '#1f5158' },
  information: { bg: '#4d5d8c', border: '#3d4a70' },
  notes: { bg: '#6b4f71', border: '#563f5b' },
};

const HOTEL_CHAIN_PATTERN = /\b(?:aloft|americinn|baymont|best western|cambria|candlewood|choice hotels?|comfort inn|comfort suites|country inn|courtyard|crowne plaza|days inn|doubletree|drury|econo lodge|element|embassy suites|extended stay america|fairfield|four points|hampton|hilton|holiday inn|home2|homewood|hyatt|ihg|kimpton|la quinta|mainstay|marriott|microtel|motel 6|omni|quality inn|radisson|ramada|red roof|renaissance|residence inn|sheraton|sleep inn|sonesta|springhill|staybridge|super 8|surestay|towneplace|tru by hilton|westin|wyndham)\b/i;

const EMAIL_STYLES = `<style>:root{color-scheme:light dark;supported-color-schemes:light dark}`
  + `@media (prefers-color-scheme:dark){.ics-body{background:#1e1e1e!important;color:#f2f2f2!important}`
  + `.ics-table,.value-cell{background:#252526!important;color:#f2f2f2!important}.label-cell{background:#303033!important;color:#e6e6e6!important}`
  + `.label-cell.alert,.value-cell.alert{background:#4b1719!important;color:#ffb3b8!important;border-color:#a64b50!important}`
  + `.hardware-arms{background:#46191b!important;color:#ffb1b5!important;border-color:#a64b50!important}`
  + `.hardware-guardian{background:#142f52!important;color:#a9ccff!important;border-color:#527fb5!important}`
  + `.hardware-mix{background:#35234b!important;color:#d8b9ff!important;border-color:#8262a6!important}`
  + `.ics-link{color:#6cb6ff!important}`
  + Object.entries(TECH_EMAIL_COLORS).map(([name, colors]) => `.tech-${name.toLowerCase()}{background:${colors.darkBg}!important;color:${colors.darkFg}!important}`).join('')
  + `}[data-ogsc] .ics-body{background:#1e1e1e!important;color:#f2f2f2!important}</style>`;

const text = value => value === null || value === undefined ? '' : String(value).trim();
const compactDate = value => text(value).replaceAll('-', '');
const displayStatus = value => {
  const status = text(value);
  return status ? `${status[0].toUpperCase()}${status.slice(1).toLowerCase()}` : '';
};

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
    `Status: ${displayStatus(event.status)}`,
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
      return `<a class="ics-link" href="${safeUrl}" style="color:#0563c1;text-decoration:underline">${safeUrl}</a>`;
    }
    return escapeHtml(part).replace(/\r\n|\r|\n/g, '<br>');
  }).join('');
}

function htmlLink(url, label) {
  return `<a class="ics-link" href="${escapeHtml(url)}" style="color:#0563c1;text-decoration:underline">${escapeHtml(label)}</a>`;
}

function isUsefulMapQuery(value) {
  const normalized = text(value).toLowerCase();
  return normalized.length >= 3 && !['none', 'n/a', 'na', 'unknown', 'tbd'].includes(normalized);
}

function mapValue(value) {
  const query = text(value);
  if (!isUsefulMapQuery(query)) return htmlValue(query);
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return htmlLink(url, query);
}

function hotelValue(value) {
  const query = text(value);
  return HOTEL_CHAIN_PATTERN.test(query) ? mapValue(query) : htmlValue(query);
}

function serverValue(value) {
  return text(value).split(',').map(part => {
    const serverId = text(part);
    return /^\d{3}$/.test(serverId)
      ? htmlLink(`https://ics1.ca.isensix.com:7${serverId}`, serverId)
      : htmlValue(serverId);
  }).join(', ');
}

function htmlSection(title, tone) {
  const colors = SECTION_COLORS[tone] || SECTION_COLORS.information;
  return `<tr><td colspan="2" style="background:${colors.bg};color:#ffffff;`
    + `font-weight:700;padding:7px 9px;border:1px solid ${colors.border}">${escapeHtml(title)}</td></tr>`;
}

function htmlRow(label, value, options = {}) {
  if (!text(value)) return '';
  const tone = options.tone || 'default';
  const toneStyles = {
    default: { labelBg: '#e8eef4', labelFg: '#243b53', valueBg: '#ffffff', valueFg: '#202124', border: '#c8d2dc' },
    alert: { labelBg: '#f8d7da', labelFg: '#842029', valueBg: '#fff0f1', valueFg: '#842029', border: '#d46a72' },
    arms: { labelBg: '#f5d7d9', labelFg: '#842029', valueBg: '#fff0f1', valueFg: '#842029', border: '#cf666d' },
    guardian: { labelBg: '#dbeafe', labelFg: '#174a7e', valueBg: '#edf5ff', valueFg: '#174a7e', border: '#7aa7d8' },
    mix: { labelBg: '#eadff5', labelFg: '#5f3b78', valueBg: '#f7f1fc', valueFg: '#5f3b78', border: '#a98bc1' },
  }[tone];
  const toneClass = tone === 'alert' ? ' alert' : tone === 'default' ? '' : ` hardware-${tone}`;
  const labelClass = options.className || '';
  const labelStyle = options.colors
    ? `background:${options.colors.bg};color:${options.colors.fg};border-color:${options.colors.border}`
    : `background:${toneStyles.labelBg};color:${toneStyles.labelFg};border-color:${toneStyles.border}`;
  const valueStyle = options.colors
    ? `background:${options.colors.bg};color:${options.colors.fg};border-color:${options.colors.border}`
    : `background:${toneStyles.valueBg};color:${toneStyles.valueFg};border-color:${toneStyles.border}`;
  return `<tr><td class="label-cell${toneClass} ${labelClass}" style="width:155px;${labelStyle};font-weight:700;`
    + `padding:6px 8px;border-width:1px;border-style:solid;vertical-align:top">${escapeHtml(label)}</td>`
    + `<td class="value-cell${toneClass} ${labelClass}" style="${valueStyle};padding:6px 8px;border-width:1px;`
    + `border-style:solid;vertical-align:top">${options.valueHtml ?? htmlValue(value)}</td></tr>`;
}

function jobInfoRow(label, key, value) {
  if (key === 'site_address') return htmlRow(label, value, { valueHtml: mapValue(value) });
  if (key === 'prev_hotel') return htmlRow(label, value, { valueHtml: hotelValue(value) });
  if (key === 'servers') return htmlRow(label, value, { valueHtml: serverValue(value) });
  if (key === 'o2' && Number.parseFloat(text(value).replaceAll(',', '')) > 0) {
    return htmlRow(label, value, { tone: 'alert' });
  }
  if (key === 'credentials' && text(value).toLowerCase() !== 'none') {
    return htmlRow(label, value, { tone: 'alert' });
  }
  if (key === 'hardware') {
    const hardware = text(value).toLowerCase();
    const tone = hardware.includes('mix') || (hardware.includes('arms') && hardware.includes('guardian'))
      ? 'mix' : hardware.includes('arms') ? 'arms' : hardware.includes('guardian') ? 'guardian' : 'default';
    return htmlRow(label, value, { tone });
  }
  return htmlRow(label, value);
}

function eventHtmlDescription(event, jobInfo, assignments, jobInfoUrl) {
  const techs = assignmentLines(event, assignments);
  const rows = [
    `<html><head><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">${EMAIL_STYLES}</head>`,
    '<body class="ics-body" bgcolor="#ffffff" style="margin:0;background:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:11pt;color:#202124">',
    '<table class="ics-table" bgcolor="#ffffff" role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:850px;background:#ffffff">',
    htmlSection('Schedule', 'schedule'),
    htmlRow('Job name', text(jobInfo?.job_name) || text(event.title)),
    htmlRow('Status', displayStatus(event.status)),
    htmlRow('Dates', `${displayDate(event.start_date)} - ${displayDate(event.end_date)}`),
    htmlRow('Ticket ID', event.ticket_id),
  ];
  if (techs.length) {
    rows.push(htmlSection('Assigned technicians', 'technicians'));
    for (const tech of techs) {
      const separator = tech.indexOf(':');
      const name = tech.slice(0, separator);
      const colors = TECH_EMAIL_COLORS[name];
      rows.push(htmlRow(name, tech.slice(separator + 1).trim(), colors
        ? { colors, className: `tech-${name.toLowerCase()}` } : {}));
    }
  }
  const infoRows = JOB_INFO_FIELDS.map(([label, key]) => jobInfoRow(label, key, jobInfo?.[key])).filter(Boolean);
  if (infoRows.length) rows.push(htmlSection('Job information', 'information'), ...infoRows);
  if (text(event.notes)) rows.push(htmlSection('Notes', 'notes'), htmlRow('Event notes', event.notes));
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
