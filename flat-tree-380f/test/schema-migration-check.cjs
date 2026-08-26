const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'schemas', file), 'utf8');
const db = new DatabaseSync(':memory:');

db.exec(read('remote-backup.sql'));
db.exec(read('calendar_job_info_authority.sql'));

const linked = db.prepare(`
  SELECT COUNT(*) AS count
  FROM calendar_events
  WHERE job_info_id IS NOT NULL
`).get().count;
if (!linked) throw new Error('The authority migration did not link any calendar events.');
const unmatchedRows = db.prepare(`
  SELECT id, title
  FROM calendar_events
  WHERE event_type = 'calibration' AND job_info_id IS NULL
  ORDER BY id
`).all();

db.exec(read('drop_job_info_schedule_columns.sql'));
const legacyColumns = new Set([
  'status',
  'scheduled_start_date',
  'scheduled_end_date',
  'scheduled_with',
]);
const remaining = db.prepare('PRAGMA table_info(job_info)').all()
  .map(row => row.name)
  .filter(name => legacyColumns.has(name));
if (remaining.length) throw new Error(`Legacy Job Info columns remain: ${remaining.join(', ')}`);

const unmatchedSummary = unmatchedRows.length
  ? ` Unmatched: ${unmatchedRows.map(row => `${row.id}:${row.title}`).join(', ')}.`
  : '';
console.log(`Schema migration check passed; ${linked} linked and ${unmatchedRows.length} unmatched calibration events.${unmatchedSummary}`);
