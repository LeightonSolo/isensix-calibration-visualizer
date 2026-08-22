import {
  addBusinessDays,
  addDays,
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

export function generateTentativeJobs(jobInfoMap, realEvents, now = new Date()) {
  const currentYear = now.getFullYear();
  const jobs = Object.values(jobInfoMap || {});

  return jobs.flatMap(job => {
    if (!job?.job_name || !activeJob(job) || !job.last_calibrated) return [];

    const lastCalibrated = parseISO(String(job.last_calibrated));
    if (!isValid(lastCalibrated) || lastCalibrated.getFullYear() >= currentYear) return [];

    const anniversary = new Date(currentYear, lastCalibrated.getMonth(), lastCalibrated.getDate());
    const targetStart = mondayOnOrBefore(anniversary);
    const hasConflict = (realEvents || []).some(event =>
      !event.isGhost &&
      String(event.title || '').trim().toLowerCase() === String(job.job_name).trim().toLowerCase() &&
      isValid(parseISO(String(event.start_date || ''))) &&
      Math.abs(differenceInCalendarDays(parseISO(event.start_date), targetStart)) < CONFLICT_WINDOW_DAYS
    );
    if (hasConflict) return [];

    const estimatedDays = Math.max(1, Math.ceil(Number(job.estimated_days) || 1));
    const targetEnd = addBusinessDays(targetStart, estimatedDays - 1);
    const ghostId = `ghost-job-${job.id ?? job.job_name}`;
    const ghostAssignments = assignmentNames(job).flatMap(techName =>
      Array.from({ length: estimatedDays }, (_, index) => ({
        tech_name: techName,
        date: format(addBusinessDays(targetStart, index), 'yyyy-MM-dd'),
        event_id: ghostId,
      }))
    );

    return [{
      id: ghostId,
      title: job.job_name,
      event_type: 'calibration',
      status: 'tentative',
      customer: job.customer ?? null,
      start_date: format(targetStart, 'yyyy-MM-dd'),
      end_date: format(targetEnd, 'yyyy-MM-dd'),
      ticket_id: null,
      notes: `Tentative — based on ${format(lastCalibrated, 'MMM yyyy')} calibration`,
      isGhost: true,
      sourceJobInfo: job,
      ghostAssignments,
    }];
  });
}

export function materializeTentativeJob(eventData) {
  const realData = { ...eventData, id: undefined };
  delete realData.isGhost;
  delete realData.sourceJobInfo;
  delete realData.ghostAssignments;
  return realData;
}
