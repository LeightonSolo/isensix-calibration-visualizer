export function findJobInfoMatch(jobInfoMap, title) {
  const normalizedTitle = title?.trim().toLocaleLowerCase();
  if (!normalizedTitle) return null;

  return Object.values(jobInfoMap || {}).find(jobInfo =>
    jobInfo?.job_name?.trim().toLocaleLowerCase() === normalizedTitle
  ) || null;
}

export function getJobInfoNames(jobInfoMap) {
  return Object.values(jobInfoMap || {})
    .map(jobInfo => jobInfo?.job_name?.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function filterJobInfoNames(jobNames, query, showAll = false) {
  if (showAll) return jobNames;
  const normalizedQuery = query?.trim().toLocaleLowerCase();
  if (!normalizedQuery) return jobNames;
  return jobNames.filter(jobName => jobName.toLocaleLowerCase().includes(normalizedQuery));
}

export function shouldUpdateAutofilledCustomer(customer, lastAutofilledCustomer, forceUpdate = false) {
  return forceUpdate || !customer || customer === lastAutofilledCustomer;
}
