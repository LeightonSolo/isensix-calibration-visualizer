const TECHNICIANS = new Set([
  'Daniel',
  'Dejan',
  'Leighton',
  'Joey',
  'Kyle',
  'Matt',
  'Fernando',
  'Bissen',
]);

type TentativeCandidate = {
  id: number;
  job_name: string;
  customer: string | null;
  last_calibrated: string;
  estimated_days: number | null;
  num_tech: number | null;
  primary_tech: string | null;
};

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextBusinessDay(date: Date) {
  let next = addUtcDays(date, 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next = addUtcDays(next, 1);
  return next;
}

export function tentativeEligibilityDate(lastCalibrated: string) {
  const source = parseIsoDate(lastCalibrated);
  const targetMonth = source.getUTCMonth() + 6;
  const year = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = targetMonth % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatIsoDate(new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay))));
}

export function tentativeAnniversaryMonday(lastCalibrated: string) {
  const source = parseIsoDate(lastCalibrated);
  const year = source.getUTCFullYear() + 1;
  const month = source.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const anniversary = new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), lastDay)));
  while (anniversary.getUTCDay() !== 1) anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return formatIsoDate(anniversary);
}

export function businessDateRange(startDate: string, duration: number) {
  const dates: string[] = [];
  let date = parseIsoDate(startDate);
  while (dates.length < Math.max(1, Math.ceil(duration || 1))) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(formatIsoDate(date));
    date = addUtcDays(date, 1);
  }
  return dates;
}

function assignmentName(candidate: TentativeCandidate) {
  const primary = String(candidate.primary_tech || '').trim();
  const canonical = [...TECHNICIANS].find(name => name.toLowerCase() === primary.toLowerCase());
  return Number(candidate.num_tech) === 1 && canonical ? canonical : 'Unassigned';
}

function reserveDates(busyByTech: Map<string, Set<string>>, techName: string, dates: string[]) {
  if (!busyByTech.has(techName)) busyByTech.set(techName, new Set());
  dates.forEach(date => busyByTech.get(techName)!.add(date));
}

function firstAvailableRange(
  startDate: string,
  duration: number,
  techName: string,
  busyByTech: Map<string, Set<string>>,
) {
  let start = parseIsoDate(startDate);
  while (true) {
    const dates = businessDateRange(formatIsoDate(start), duration);
    if (!dates.some(date => busyByTech.get(techName)?.has(date))) return dates;
    start = nextBusinessDay(start);
  }
}

export async function reconcileTentativeCalendar(db: D1Database, today = new Date()) {
  const todayIso = formatIsoDate(today);
  const { results } = await db.prepare(`
    SELECT
      j.id, j.job_name, j.customer, j.last_calibrated, j.estimated_days,
      j.num_tech, j.primary_tech
    FROM job_info j
    WHERE j.job_name IS NOT NULL
      AND trim(j.job_name) <> ''
      AND j.last_calibrated IS NOT NULL
      AND (
        j.active IS NULL
        OR upper(trim(CAST(j.active AS TEXT))) IN ('1', 'TRUE')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM calendar_events e
        WHERE e.event_type = 'calibration'
          AND e.job_info_id = j.id
          AND e.source_calibration_date = j.last_calibrated
      )
      AND NOT EXISTS (
        SELECT 1
        FROM calendar_events e
        WHERE e.event_type = 'calibration'
          AND e.job_info_id = j.id
          AND abs(
            julianday(e.start_date) - julianday(date(j.last_calibrated, '+1 year'))
          ) < 90
      )
    ORDER BY date(j.last_calibrated, '+1 year'), j.job_name
  `).all<TentativeCandidate>();

  const eligibleResults = results.filter(candidate =>
    tentativeEligibilityDate(candidate.last_calibrated) <= todayIso
  );
  if (!eligibleResults.length) return { created: 0 };

  const busyByTech = new Map<string, Set<string>>();
  const busy = await db.prepare(`
    SELECT tech_name, date FROM event_assignments
    UNION ALL
    SELECT tech_name, date FROM tech_events
  `).all<{ tech_name: string; date: string }>();
  busy.results.forEach(row => reserveDates(busyByTech, row.tech_name, [row.date]));

  let created = 0;
  for (const candidate of eligibleResults) {
    const techName = assignmentName(candidate);
    const targetStart = tentativeAnniversaryMonday(candidate.last_calibrated);
    const dates = firstAvailableRange(
      targetStart,
      Number(candidate.estimated_days) || 1,
      techName,
      busyByTech,
    );
    reserveDates(busyByTech, techName, dates);

    const result = await db.prepare(`
      INSERT OR IGNORE INTO calendar_events (
        job_info_id, source_calibration_date, title, event_type, status,
        customer, start_date, end_date, ticket_id, notes
      ) VALUES (?, ?, ?, 'calibration', 'tentative', ?, ?, ?, NULL, ?)
    `).bind(
      candidate.id,
      candidate.last_calibrated,
      candidate.job_name,
      candidate.customer,
      dates[0],
      dates[dates.length - 1],
      `Tentative — six-month rollover from ${candidate.last_calibrated}`,
    ).run();

    if (!result.meta.changes) continue;
    created += 1;
    if (techName !== 'Unassigned') {
      const eventId = result.meta.last_row_id;
      await db.batch(dates.map(date => db.prepare(`
        INSERT OR IGNORE INTO event_assignments (event_id, tech_name, date)
        VALUES (?, ?, ?)
      `).bind(eventId, techName, date)));
    }
  }

  return { created };
}
