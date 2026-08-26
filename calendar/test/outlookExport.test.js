import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutlookCalendar, outlookCalendarFilename } from '../src/utils/outlookExport.js';

const event = {
  id: 42, title: 'LifeSouth', event_type: 'calibration', status: 'confirmed',
  start_date: '2026-09-21', end_date: '2026-09-25', ticket_id: '74142',
  notes: 'Bring the calibration kit.',
};

test('builds an Outlook all-day event with job and contact information', () => {
  const content = buildOutlookCalendar({
    event,
    jobInfo: {
      job_name: 'LifeSouth', site_address: '4039 Newberry Rd, Gainesville, FL 32607',
      credentials: 'Vendormate', main_contact: 'Teresa Broderick', other_contacts: 'Eugene',
      contact_notes: 'Call on arrival', sensors: 419,
    },
    assignments: [
      ...['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
        .map(date => ({ event_id: 42, tech_name: 'Bissen', date })),
      { event_id: 99, tech_name: 'Matt', date: '2026-09-21' },
    ],
    jobInfoUrl: 'https://example.com/jobs.html?job=LifeSouth',
    now: new Date('2026-08-26T15:30:00Z'),
  });
  const unfolded = content.replace(/\r\n[ \t]/g, '');
  assert.match(unfolded, /DTSTART;VALUE=DATE:20260921/);
  assert.match(unfolded, /DTEND;VALUE=DATE:20260926/);
  assert.match(unfolded, /SUMMARY:\(C\) LifeSouth Annual Calibrations TID: 74142/);
  assert.match(unfolded, /LOCATION:4039 Newberry Rd\\, Gainesville\\, FL 32607/);
  assert.match(unfolded, /Bissen: 9\/21\/2026 - 9\/25\/2026/);
  assert.doesNotMatch(unfolded, /Matt:/);
  assert.match(unfolded, /Credentials needed: Vendormate/);
  assert.match(unfolded, /Main contact: Teresa Broderick/);
  assert.match(unfolded, /Other contacts: Eugene/);
  assert.match(unfolded, /Contact notes: Call on arrival/);
  assert.match(unfolded, /UID:calendar-event-42@isensix.com/);
  assert.match(unfolded, /STATUS:CONFIRMED/);
  assert.match(unfolded, /X-ALT-DESC;FMTTYPE=text\/html:<html>/);
  assert.match(unfolded, /background:#1f4e78;color:#ffffff/);
  assert.match(unfolded, /font-weight:700[^>]*>Main contact<\/td>/);
  assert.match(unfolded, />Teresa Broderick<\/td>/);
  assert.match(unfolded, />Credentials needed<\/td>/);
  assert.match(unfolded, />Vendormate<\/td>/);
  assert.match(unfolded, />Open Job Info<\/a>/);
});

test('folds long UTF-8 content to at most 75 bytes per physical line', () => {
  const content = buildOutlookCalendar({
    event, jobInfo: { comments: `Temperature ${'é'.repeat(100)}` },
    now: new Date('2026-08-26T15:30:00Z'),
  });
  for (const line of content.trimEnd().split('\r\n')) {
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  }
});

test('uses clear tentative labels and a safe filename', () => {
  const tentative = { ...event, status: 'tentative', title: 'A/B: Test' };
  const content = buildOutlookCalendar({ event: tentative, now: new Date('2026-08-26T15:30:00Z') });
  assert.match(content, /SUMMARY:\(Tentative\) A\/B: Test Annual Calibrations/);
  assert.match(content, /STATUS:TENTATIVE/);
  assert.equal(outlookCalendarFilename(tentative), '2026-09-21-AB-Test-TID-74142.ics');
});
