/** Powers the Jobs directory, analytics views, filters, CSV export, drawer, and authenticated Job Info editor. */
(function () {
  'use strict';

  const API_HEADERS = { 'X-Api-Key': CONFIG.API_KEY };
  const EDITOR_TOKEN_KEY = 'cal_editor_token';
  const SOFTWARE_FAMILIES = ['ARMS', 'G2.0', 'G2.1', 'G3.0'];
  const state = {
    jobs: [], stats: null, events: [], assignments: [], filtered: [], view: 'directory',
    sortKey: 'job_name', sortDir: 1, preset: 'all',
    columnWidths: {},
    selected: null, editing: false, dirty: false, pendingAction: null,
    initialJob: new URLSearchParams(location.search).get('job'), initialJobOpened: false,
  };

  const columns = {
    planning: [
      ['job_name', 'Job'], ['servers', 'Servers'], ['last_calibrated', 'Last calibrated'],
      ['status', 'Calendar status'], ['scheduled_start_date', 'Scheduled start'], ['scheduled_end_date', 'Scheduled end'],
      ['sensors', 'Sensors'], ['num_tech', 'Techs'], ['o2', 'O₂'], ['primary_tech', 'Primary tech'], ['main_contact', 'Main contact'], ['other_contacts', 'Other contacts'],
      ['contact_notes', 'Contact notes'], ['scheduled_with', 'Scheduled with'], ['hardware', 'Hardware'], ['location', 'Location'],
    ],
    equipment: [
      ['job_name', 'Job'], ['servers', 'Servers'], ['sensors', 'Sensors'], ['meters', 'Meters'],
      ['o2', 'O₂'], ['hardware', 'Hardware'], ['server_version', 'Software'], ['vpn_works', 'VPN'],
      ['last_calibrated', 'Last calibrated'],
    ],
    travel: [
      ['job_name', 'Job'], ['location', 'Location'], ['site_address', 'Main address'],
      ['airport_info', 'Airport'], ['emerald_aisle', 'Emerald Aisle'], ['prev_hotel', 'Previous hotel'], ['hotel_comments', 'Hotel comments'], ['restaurants', 'Restaurants and attractions'],
      ['vpn_works', 'VPN'], ['scheduled_with', 'Technicians'],
    ],
    all: [
      ['job_name', 'Job'], ['customer', 'Customer'], ['servers', 'Servers'],
      ['last_calibrated', 'Last calibrated'], ['status', 'Calendar status'],
      ['scheduled_start_date', 'Scheduled start'], ['scheduled_end_date', 'Scheduled end'],
      ['sensors', 'Sensors'], ['num_tech', 'Techs'], ['meters', 'Meters'],
      ['o2', 'O₂'], ['comments', 'Comments'], ['scheduled_with', 'Scheduled with'],
      ['primary_tech', 'Primary tech'], ['hardware', 'Hardware'], ['server_version', 'Software'],
      ['location', 'Location'], ['site_address', 'Address'], ['vpn_works', 'VPN'],
      ['airport_info', 'Airport'], ['emerald_aisle', 'Emerald Aisle'], ['main_contact', 'Main contact'], ['other_contacts', 'Other contacts'], ['contact_notes', 'Contact notes'],
       ['prev_hotel', 'Previous hotel'], ['hotel_comments', 'Hotel comments'], ['restaurants', 'Restaurants and attractions'], ['updated_at', 'Updated'], ['active', 'Active?'],
    ],
  };

  const formSections = [
    ['Overview', [
      ['job_name', 'Job name', 'text', 'wide'], ['customer', 'Customer'],
      ['last_calibrated', 'Last calibrated', 'date'], ['active', 'Active record', 'checkbox'],
      ['primary_tech', 'Primary technician', 'tech'],
    ], 'compact'],
    ['Equipment', [
      ['servers', 'Servers'], ['sensors', 'Sensor count', 'number'], ['meters', 'Meters needed'],
      ['o2', 'O₂ sensors', 'number'], ['server_version', 'Software version'], ['hardware', 'Hardware', 'hardware'],
    ], 'compact'],
    ['Planning', [
      ['status', 'Calendar status', 'readonly'],
      ['scheduled_start_date', 'Scheduled start', 'readonly'],
      ['scheduled_end_date', 'Scheduled end', 'readonly'],
      ['scheduled_with', 'Scheduled with', 'readonly'],
      ['num_tech', 'Technicians needed', 'number'], ['estimated_days', 'Estimated days', 'number'],
    ], 'compact'],
    ['Location', [
      ['site_address', 'Main site address', 'textarea'], ['offsites', 'Offsites', 'textarea'],
    ]],
    ['Contacts', [
      ['main_contact', 'Main contact', 'textarea'], ['other_contacts', 'Other contacts', 'textarea'],
      ['contact_notes', 'Contact notes', 'textarea', true],
    ]],
    ['Travel and access', [
      ['vpn_works', 'VPN works?'], ['airport_info', 'Airport information'],
      ['emerald_aisle', 'Emerald Aisle'], ['prev_hotel', 'Previous hotel'],
      ['hotel_comments', 'Hotel comments', 'textarea'], ['restaurants', 'Restaurants and attractions', 'textarea'],
      ['credentials', 'Credentials'],
    ]],
    ['Documentation and notes', [
      ['report', 'Report information', 'textarea'], ['comments', 'Comments', 'textarea'],
      ['other_notes', 'Other notes', 'textarea', true],
    ]],
  ];

  const $ = id => document.getElementById(id);
  const text = value => value === null || value === undefined || value === '' ? '—' : String(value);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);

  async function api(path, options = {}) {
    const response = await fetch(`${CONFIG.WORKER_URL}${path}`, {
      ...options,
      headers: { ...API_HEADERS, ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return response.json();
  }

  function parseState(address) {
    const match = String(address || '').toUpperCase().match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\b/);
    return match ? match[1] : '';
  }

  function locationLabel(job) {
    const address = String(job.site_address || '').trim();
    if (!address) return '';
    const parts = address.split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parseState(address) || parts[parts.length - 1]}`;
    return address;
  }

  function hardwareClass(value) {
    const normalized = String(value || '').toLowerCase();
    return normalized === 'guardian' ? 'guardian' : normalized === 'arms' ? 'arms' : normalized === 'mix' ? 'mix' : '';
  }

  function softwareFamily(value) {
    const prefix = String(value || '').trim().slice(0, 4).toUpperCase();
    return SOFTWARE_FAMILIES.includes(prefix) ? prefix : '';
  }

  async function loadData() {
    $('load-status').textContent = 'Loading jobs…';
    try {
      const jobsRequest = api('/jobinfo/summary').then(async rows => {
        if (rows.some(row => Object.prototype.hasOwnProperty.call(row, 'prev_hotel'))) return rows;
        // Compatibility with a deployed Worker that predates prev_hotel in the
        // summary projection. Remove this fallback after every environment is updated.
        const legacyRows = await api('/jobinfo/all');
        const hotelByJob = new Map(legacyRows.map(row => [row.job_name, row.prev_hotel]));
        return rows.map(row => ({ ...row, prev_hotel: hotelByJob.get(row.job_name) ?? null }));
      });
      const [jobs, stats, events, assignments] = await Promise.all([
        jobsRequest, api('/jobinfo/stats'),
        api('/calendar/events').catch(() => []), api('/calendar/assignments').catch(() => []),
      ]);
      state.jobs = jobs.map(job => ({ ...job, location: locationLabel(job), state: parseState(job.site_address) }));
      state.stats = stats;
      state.events = events;
      state.assignments = assignments;
      addLocalSensorTotals();
      populateFilters();
      applyFilters();
      renderAnalytics();
      if (state.initialJob && !state.initialJobOpened) {
        state.initialJobOpened = true;
        const match = state.jobs.find(job => job.job_name.toLowerCase() === state.initialJob.toLowerCase());
        if (match) openJob(match.job_name);
      }
      $('load-status').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    } catch (error) {
      console.error(error);
      $('load-status').textContent = 'Could not load job information';
    }
  }

  function sensorTotalsByJobField(key) {
    return state.jobs.reduce((totals, job) => {
      const label = key === 'last_calibrated' ? String(job.last_calibrated || '').slice(0, 7)
        : String(job[key] || '').trim() || 'Unknown';
      if (label) totals[label] = (totals[label] || 0) + (Number(job.sensors) || 0);
      return totals;
    }, {});
  }

  function addSensorsToRows(rows, totals) {
    return (rows || []).map(row => ({
      ...row,
      sensor_value: totals[row.label] ?? row.sensor_value ?? 0,
    }));
  }

  function addLocalSensorTotals() {
    if (!state.stats) return;
    const jobByName = new Map(state.jobs.map(job => [String(job.job_name || '').trim().toLowerCase(), job]));
    const eventById = new Map(state.events.map(event => [String(event.id), event]));

    state.stats.hardware = addSensorsToRows(state.stats.hardware, sensorTotalsByJobField('hardware'));
    state.stats.software = aggregateJobCategories(job => {
      const family = softwareFamily(job.server_version);
      return family ? [family] : [];
    });
    state.stats.latest_calibrations_by_month = addSensorsToRows(
      state.stats.latest_calibrations_by_month, sensorTotalsByJobField('last_calibrated'));

    const monthSensors = {};
    state.events.filter(event => event.event_type === 'calibration').forEach(event => {
      const month = String(event.start_date || '').slice(0, 7);
      const job = jobByName.get(String(event.title || '').trim().toLowerCase());
      if (month) monthSensors[month] = (monthSensors[month] || 0) + (Number(job?.sensors) || 0);
    });
    state.stats.calendar_jobs_by_month = addSensorsToRows(state.stats.calendar_jobs_by_month, monthSensors);

    const techSensors = {};
    const seenTechEvents = new Set();
    state.assignments.forEach(assignment => {
      const event = eventById.get(String(assignment.event_id));
      if (!event || event.event_type !== 'calibration') return;
      const key = `${assignment.tech_name}\u0000${assignment.event_id}`;
      if (seenTechEvents.has(key)) return;
      seenTechEvents.add(key);
      const job = jobByName.get(String(event.title || '').trim().toLowerCase());
      techSensors[assignment.tech_name] = (techSensors[assignment.tech_name] || 0) + (Number(job?.sensors) || 0);
    });
    state.stats.calendar_jobs_by_tech = addSensorsToRows(state.stats.calendar_jobs_by_tech, techSensors);

    const hardwareSensors = sensorTotalsByJobField('hardware');
    state.stats.overview.guardian_sensors ??= hardwareSensors.Guardian || 0;
    state.stats.overview.arms_sensors ??= hardwareSensors.ARMS || 0;
    state.stats.overview.mixed_sensors ??= hardwareSensors.Mix || 0;
  }

  function aggregateJobCategories(extractor) {
    const totals = {};
    state.jobs.forEach(job => {
      [...new Set(extractor(job))].forEach(label => {
        if (!label) return;
        totals[label] ||= { label, value: 0, sensor_value: 0 };
        totals[label].value += 1;
        totals[label].sensor_value += Number(job.sensors) || 0;
      });
    });
    return Object.values(totals).sort((a, b) => b.value - a.value || b.sensor_value - a.sensor_value || a.label.localeCompare(b.label));
  }

  function airportCodes(job) {
    const excluded = new Set(['THE', 'AND', 'AIR', 'VIA', 'USE', 'USA']);
    return (String(job.airport_info || '').toUpperCase().match(/\b[A-Z]{3}\b/g) || [])
      .filter(code => !excluded.has(code));
  }

  function hotelParents(job) {
    const hotel = String(job.prev_hotel || '').trim();
    if (!hotel || /^(none|nothing|n\/a|no hotel)[.!\s]*$/i.test(hotel)) return [];
    const portfolios = [
      ['Hilton', /\b(hilton|hampton|homewood|home2|doubletree|embassy suites|tru by|waldorf astoria|conrad|canopy)\b/i],
      ['Marriott', /\b(marriott|fairf+ield|springhill|courtyard|town(?:e)?place|sheraton|four points|westin|aloft|renaissance|residence inn|ac hotel|moxy|element|st\.? regis|ritz-carlton)\b/i],
      ['IHG', /\b(ihg|holiday inn|hie|crowne plaza|staybridge|candlewood|hotel indigo|intercontinental|kimpton|avid hotel)\b/i],
      ['Hyatt', /\b(hyatt|andaz)\b/i],
      ['Best Western', /\b(best western|surestay|glo best)\b/i],
      ['Choice Hotels', /\b(choice hotel|radisson|country inn|comfort inn|comfort suites|quality inn|sleep inn|clarion|cambria|mainstay|econo lodge|rodeway)\b/i],
      ['Wyndham', /\b(wyndham|la quinta|days inn|super 8|ramada|wingate|microtel|baymont|hawthorn suites)\b/i],
      ['Sonesta', /\b(sonesta|red lion|americas best value inn)\b/i],
      ['Accor', /\b(accor|fairmont|novotel|sofitel|ibis|m[öo]venpick)\b/i],
      ['Drury', /\bdrury\b/i],
      ['Omni', /\bomni\b/i],
      ['Extended Stay America', /\bextended stay america\b/i],
    ];
    const matches = portfolios.filter(([, pattern]) => pattern.test(hotel)).map(([parent]) => parent);
    return matches.length ? matches : ['Independent / Other'];
  }

  function uniqueValues(key) {
    return [...new Set(state.jobs.flatMap(job => {
      const raw = job[key];
      if (!raw) return [];
      return key === 'scheduled_with' ? String(raw).split(',').map(v => v.trim()).filter(Boolean) : [String(raw).trim()];
    }))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function setOptions(id, values, firstLabel) {
    const select = $(id);
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` + values.map(value =>
      `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    select.value = values.includes(current) ? current : '';
  }

  function populateFilters() {
    setOptions('hardware-filter', uniqueValues('hardware'), 'All hardware');
    setOptions('software-filter', SOFTWARE_FAMILIES, 'All software');
    const technicians = [...new Set([...uniqueValues('scheduled_with'), ...uniqueValues('primary_tech')])]
      .sort((a, b) => a.localeCompare(b));
    setOptions('tech-filter', technicians, 'All technicians');
    setOptions('state-filter', uniqueValues('state'), 'All states');
  }

  function applyFilters() {
    const query = $('job-search').value.trim().toLowerCase();
    const hardware = $('hardware-filter').value;
    const software = $('software-filter').value;
    const tech = $('tech-filter').value.toLowerCase();
    const jobState = $('state-filter').value;
    const active = $('active-filter').value;

    state.filtered = state.jobs.filter(job => {
      const haystack = Object.values(job).join(' ').toLowerCase();
      return (!query || haystack.includes(query))
        && (!hardware || job.hardware === hardware)
        && (!software || softwareFamily(job.server_version) === software)
        && (!tech || String(job.scheduled_with || '').toLowerCase().includes(tech) || String(job.primary_tech || '').toLowerCase() === tech)
        && (!jobState || job.state === jobState)
        && (!active || (active === 'active' ? Number(job.active) === 1 : Number(job.active) !== 1));
    });

    state.filtered.sort((a, b) => {
      const av = a[state.sortKey] ?? '';
      const bv = b[state.sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * state.sortDir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * state.sortDir;
    });
    renderTable();
  }

  function renderTable() {
    const selectedColumns = columns[state.preset];
    const presetWidths = state.columnWidths[state.preset];
    const tableWidth = presetWidths?.reduce((total, width) => total + width, 0);
    const numericRange = key => {
      const values = state.jobs.map(job => job[key])
        .filter(value => value !== null && value !== undefined && value !== '')
        .map(Number).filter(Number.isFinite);
      return { min: Math.min(...values), max: Math.max(...values) };
    };
    const sensorRange = numericRange('sensors');
    const techRange = numericRange('num_tech');
    const calibrationAges = state.jobs.map(job => {
      const timestamp = Date.parse(`${job.last_calibrated || ''}T00:00:00`);
      return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 86400000) : null;
    }).filter(Number.isFinite);
    const calibrationRange = {
      min: Math.min(...calibrationAges),
      max: Math.max(...calibrationAges),
    };
    const rangeLevel = (value, range) => {
      if (!Number.isFinite(value) || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
      if (range.max === range.min) return 0.35;
      return 0.08 + 0.92 * ((value - range.min) / (range.max - range.min));
    };
    const metricBar = (key, value) => {
      if (value === null || value === undefined || value === '') return null;
      if (key === 'sensors') return { level: rangeLevel(Number(value), sensorRange), color: '#287fd1' };
      if (key === 'num_tech') return { level: rangeLevel(Number(value), techRange), color: '#8b63d2' };
      if (key !== 'last_calibrated') return null;
      const timestamp = Date.parse(`${value}T00:00:00`);
      if (!Number.isFinite(timestamp)) return null;
      const age = Math.max(0, (Date.now() - timestamp) / 86400000);
      const level = rangeLevel(age, calibrationRange);
      return { level, color: `hsl(${Math.round(120 * (1 - level))} 58% 48%)` };
    };
    $('jobs-table').classList.toggle('has-resized-columns', Boolean(presetWidths));
    $('jobs-table').style.width = tableWidth ? `${tableWidth}px` : '';
    $('jobs-table').style.minWidth = tableWidth ? `${tableWidth}px` : '';
    $('jobs-table-head').innerHTML = selectedColumns.map(([key, label], index) =>
      `<th data-sort="${key}"${presetWidths ? ` style="width:${presetWidths[index]}px"` : ''}><span>${escapeHtml(label)}${state.sortKey === key ? (state.sortDir === 1 ? ' ↑' : ' ↓') : ''}</span><span class="column-resizer" aria-hidden="true"></span></th>`).join('');
    $('jobs-table-body').innerHTML = state.filtered.map(job => `<tr class="${Number(job.active) === 1 ? '' : 'inactive-job'}" data-job="${escapeHtml(job.job_name)}">${selectedColumns.map(([key]) => {
      const value = job[key];
      if (key === 'hardware') return `<td><span class="badge ${hardwareClass(value)}">${escapeHtml(text(value))}</span></td>`;
      if (key === 'o2' && Number(value) > 0) return `<td><span style="background: #e03e3e;color:var(--text-primary);padding:1px 3px;border-radius:var(--radius-sm);">${escapeHtml(value)}</span></td>`;
      const cls = `${key === 'job_name' ? 'job-name' : ''} ${key === 'servers' ? 'mono' : ''}`.trim();
      const bar = metricBar(key, value);
      if (bar && bar.level !== null) return `<td class="${cls} data-bar" style="--data-level:${bar.level.toFixed(3)};--data-bar-color:${bar.color}" title="${escapeHtml(text(value))}"><span>${escapeHtml(text(value))}</span></td>`;
      return `<td class="${cls}" title="${escapeHtml(text(value))}">${escapeHtml(text(value))}</td>`;
    }).join('')}</tr>`).join('');
    $('result-count').textContent = `${state.filtered.length} of ${state.jobs.length} jobs`;
    $('jobs-empty').hidden = state.filtered.length !== 0;
  }

  function beginColumnResize(event) {
    const handle = event.target.closest('.column-resizer');
    if (!handle) return;
    event.preventDefault();
    event.stopPropagation();

    const header = handle.closest('th');
    const headers = [...$('jobs-table-head').querySelectorAll('th')];
    const columnIndex = headers.indexOf(header);
    if (columnIndex < 0) return;

    const widths = headers.map(cell => Math.round(cell.getBoundingClientRect().width));
    const startX = event.clientX;
    const startWidth = widths[columnIndex];
    state.columnWidths[state.preset] = [...widths];
    headers.forEach((cell, index) => { cell.style.width = `${widths[index]}px`; });
    $('jobs-table').classList.add('has-resized-columns');
    const initialTableWidth = widths.reduce((total, width) => total + width, 0);
    $('jobs-table').style.width = `${initialTableWidth}px`;
    $('jobs-table').style.minWidth = `${initialTableWidth}px`;
    document.body.classList.add('resizing-jobs-column');

    const onMove = moveEvent => {
      widths[columnIndex] = Math.max(70, Math.round(startWidth + moveEvent.clientX - startX));
      state.columnWidths[state.preset] = [...widths];
      header.style.width = `${widths[columnIndex]}px`;
      const tableWidth = widths.reduce((total, width) => total + width, 0);
      $('jobs-table').style.width = `${tableWidth}px`;
      $('jobs-table').style.minWidth = `${tableWidth}px`;
    };
    const onUp = () => {
      document.body.classList.remove('resizing-jobs-column');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('.jobs-view-tab').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    $('directory-view').hidden = view !== 'directory';
    $('analytics-view').hidden = view !== 'analytics';
  }

  function barChart(id, rows, onClick) {
    const target = $(id);
    const clean = (rows || []).filter(row => row.label).slice(0, 15);
    const maxJobs = Math.max(1, ...clean.map(row => Number(row.value) || 0));
    const maxSensors = Math.max(1, ...clean.map(row => Number(row.sensor_value) || 0));
    target.innerHTML = clean.length ? clean.map(row => `<div class="bar-row" ${onClick ? `data-chart-label="${escapeHtml(row.label)}" role="button" tabindex="0"` : ''}>
      <span class="bar-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
      <span class="bar-tracks">
        <span class="bar-track" title="${Number(row.value).toLocaleString()} jobs"><span class="bar-fill jobs" style="width:${Math.max(1, Number(row.value) / maxJobs * 100)}%"></span></span>
        <span class="bar-track" title="${Number(row.sensor_value || 0).toLocaleString()} sensors"><span class="bar-fill sensors" style="width:${Math.max(1, Number(row.sensor_value || 0) / maxSensors * 100)}%"></span></span>
      </span>
      <span class="bar-value"><strong>${Number(row.value).toLocaleString()} jobs</strong><small>${Number(row.sensor_value || 0).toLocaleString()} sensors</small></span>
    </div>`).join('') : '<div class="jobs-empty">No data available.</div>';
    if (onClick) target.querySelectorAll('[data-chart-label]').forEach(row => {
      const activate = () => onClick(row.dataset.chartLabel);
      row.addEventListener('click', activate);
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate(); });
    });
  }

  function monthChart(id, rows) {
    const target = $(id);
    const clean = (rows || []).filter(row => row.label).slice(-24);
    const maxJobs = Math.max(1, ...clean.map(row => Number(row.value) || 0));
    const maxSensors = Math.max(1, ...clean.map(row => Number(row.sensor_value) || 0));
    target.innerHTML = clean.length ? clean.map(row => `<div class="month-column" title="${escapeHtml(row.label)}: ${row.value}">
      <strong>${Number(row.value).toLocaleString()}j / ${Number(row.sensor_value || 0).toLocaleString()}s</strong>
      <div class="month-bars"><div class="month-bar jobs" style="height:${Math.max(2, Number(row.value) / maxJobs * 125)}px"></div><div class="month-bar sensors" style="height:${Math.max(2, Number(row.sensor_value || 0) / maxSensors * 125)}px"></div></div>
      <span>${escapeHtml(row.label)}</span>
    </div>`).join('') : '<div class="jobs-empty">No data available.</div>';
  }

  function technicianChart(id, scheduledRows) {
    const target = $(id);
    const primary = state.jobs.reduce((totals, job) => {
      const tech = String(job.primary_tech || '').trim();
      if (!tech) return totals;
      totals[tech] ||= { value: 0, sensor_value: 0 };
      totals[tech].value += 1;
      totals[tech].sensor_value += Number(job.sensors) || 0;
      return totals;
    }, {});
    const scheduled = Object.fromEntries((scheduledRows || []).map(row => [row.label, row]));
    const techs = [...new Set([...Object.keys(scheduled), ...Object.keys(primary)])]
      .sort((a, b) => (Number(scheduled[b]?.value) || 0) - (Number(scheduled[a]?.value) || 0) || a.localeCompare(b));
    const maxScheduledJobs = Math.max(1, ...techs.map(tech => Number(scheduled[tech]?.value) || 0));
    const maxScheduledSensors = Math.max(1, ...techs.map(tech => Number(scheduled[tech]?.sensor_value) || 0));
    const maxPrimaryJobs = Math.max(1, ...techs.map(tech => Number(primary[tech]?.value) || 0));
    const maxPrimarySensors = Math.max(1, ...techs.map(tech => Number(primary[tech]?.sensor_value) || 0));
    const width = (value, max) => value > 0 ? Math.max(1, value / max * 100) : 0;

    target.innerHTML = techs.length ? techs.map(tech => {
      const scheduledJobs = Number(scheduled[tech]?.value) || 0;
      const scheduledSensors = Number(scheduled[tech]?.sensor_value) || 0;
      const primaryJobs = Number(primary[tech]?.value) || 0;
      const primarySensors = Number(primary[tech]?.sensor_value) || 0;
      return `<div class="tech-breakdown-row" data-chart-label="${escapeHtml(tech)}" role="button" tabindex="0">
        <strong class="tech-name">${escapeHtml(tech)}</strong>
        <div class="tech-measures">
          <div class="tech-measure">
            <span class="tech-measure-label scheduled">Scheduled</span>
            <span class="bar-tracks">
              <span class="bar-track"><span class="bar-fill jobs" style="width:${width(scheduledJobs, maxScheduledJobs)}%"></span></span>
              <span class="bar-track"><span class="bar-fill sensors" style="width:${width(scheduledSensors, maxScheduledSensors)}%"></span></span>
            </span>
            <span class="tech-values"><strong>${scheduledJobs.toLocaleString()} jobs</strong><small>${scheduledSensors.toLocaleString()} sensors</small></span>
          </div>
          <div class="tech-measure">
            <span class="tech-measure-label primary">Primary</span>
            <span class="bar-tracks">
              <span class="bar-track"><span class="bar-fill primary-jobs" style="width:${width(primaryJobs, maxPrimaryJobs)}%"></span></span>
              <span class="bar-track"><span class="bar-fill primary-sensors" style="width:${width(primarySensors, maxPrimarySensors)}%"></span></span>
            </span>
            <span class="tech-values"><strong>${primaryJobs.toLocaleString()} jobs</strong><small>${primarySensors.toLocaleString()} sensors</small></span>
          </div>
        </div>
      </div>`;
    }).join('') : '<div class="jobs-empty">No technician data available.</div>';

    target.querySelectorAll('[data-chart-label]').forEach(row => {
      const activate = () => filterFromChart('tech-filter', row.dataset.chartLabel);
      row.addEventListener('click', activate);
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate(); });
    });
  }

  function renderAnalytics() {
    if (!state.stats) return;
    const overview = state.stats.overview || {};
    const cards = [
      ['Jobs', overview.total_jobs, `${Number(overview.total_sensors || 0).toLocaleString()} sensors`],
      ['Sensors', overview.total_sensors, 'Across all job records'],
      ['Guardian', overview.guardian_jobs, `${Number(overview.guardian_sensors || 0).toLocaleString()} sensors`],
      ['ARMS', overview.arms_jobs, `${Number(overview.arms_sensors || 0).toLocaleString()} sensors`],
      ['Mixed hardware', overview.mixed_jobs, `${Number(overview.mixed_sensors || 0).toLocaleString()} sensors`],
      ['Needs cleanup', Number(overview.hardware_missing || 0) + Number(overview.address_missing || 0) + Number(overview.calibration_date_missing || 0), 'Missing key values'],
    ];
    $('analytics-cards').innerHTML = cards.map(([label, value, detail]) => `<article class="panel analytics-card"><span>${label}</span><strong>${Number(value || 0).toLocaleString()}</strong><small>${detail}</small></article>`).join('');
    barChart('hardware-chart', state.stats.hardware, label => filterFromChart('hardware-filter', label));
    barChart('software-chart', state.stats.software,
      label => filterFromChart('software-filter', label));
    monthChart('month-chart', state.stats.calendar_jobs_by_month);
    technicianChart('tech-chart', state.stats.calendar_jobs_by_tech);
    const byState = Object.values(state.jobs.reduce((acc, job) => {
      const key = job.state || 'Unknown';
      acc[key] ||= { label: key, value: 0, sensor_value: 0 };
      acc[key].value += 1;
      acc[key].sensor_value += Number(job.sensors) || 0;
      return acc;
    }, {})).sort((a, b) => b.value - a.value);
    barChart('state-chart', byState, label => filterFromChart('state-filter', label === 'Unknown' ? '' : label));
    monthChart('latest-chart', state.stats.latest_calibrations_by_month);
    barChart('airport-chart', aggregateJobCategories(airportCodes));
    barChart('hotel-chart', aggregateJobCategories(hotelParents));
  }

  function filterFromChart(id, value) {
    $(id).value = value;
    setView('directory');
    applyFilters();
  }

  function fieldHtml(field, job, isNew) {
    const [key, label, kind = 'text', span = 'normal'] = field;
    const value = job[key] ?? '';
    const disabledName = key === 'job_name' && !isNew ? ' data-locked-name="true"' : '';
    const spanClass = span === true ? 'full' : span === 'normal' ? '' : span;
    if (kind === 'checkbox') return `<div class="field field-check ${spanClass}"><input id="field-${key}" name="${key}" type="checkbox" ${Number(value) === 1 ? 'checked' : ''}><label for="field-${key}">${label}</label></div>`;
    if (kind === 'readonly') return `<div class="field ${spanClass}"><label>${label}</label><div class="field-readonly">${escapeHtml(text(value))}</div><small>Managed from the calendar</small></div>`;
    let control;
    if (kind === 'textarea') control = `<textarea id="field-${key}" name="${key}" rows="3">${escapeHtml(value)}</textarea>`;
    else if (kind === 'tech') control = `<input id="field-${key}" name="${key}" list="tech-options" value="${escapeHtml(value)}">`;
    else if (kind === 'hardware') control = `<input id="field-${key}" name="${key}" list="hardware-options" value="${escapeHtml(value)}">`;
    else control = `<input id="field-${key}" name="${key}" type="${kind}" value="${escapeHtml(value)}"${kind === 'number' ? ' min="0"' : ''}${disabledName}>`;
    return `<div class="field ${spanClass}"><label for="field-${key}">${label}</label>${control}</div>`;
  }

  function renderForm(job, isNew = false) {
    $('job-form-content').innerHTML = formSections.map(([title, fields, layout = '']) => `<section class="drawer-section"><h3>${title}</h3><div class="form-grid ${layout}">${fields.map(field => fieldHtml(field, job, isNew)).join('')}</div></section>`).join('')
      + `<datalist id="tech-options">${CONFIG.TECHNICIANS.filter(Boolean).map(v => `<option value="${escapeHtml(v)}">`).join('')}</datalist><datalist id="hardware-options"><option value="Guardian"><option value="ARMS"><option value="Mix"></datalist>`;
    setEditing(isNew);
    state.dirty = false;
    $('job-form').addEventListener('input', () => { state.dirty = true; }, { once: true });
  }

  function sizeReadOnlyTextareas() {
    if (state.editing) return;
    $('job-form').querySelectorAll('textarea:disabled').forEach(control => {
      control.rows = 1;
      control.style.height = '';
      control.style.height = `${control.scrollHeight + 2}px`;
    });
  }

  function setEditing(editing) {
    state.editing = editing;
    $('job-form').querySelectorAll('input, textarea, select').forEach(control => {
      control.disabled = !editing || (editing && control.dataset.lockedName === 'true');
      if (control.tagName === 'TEXTAREA') {
        control.rows = editing ? 3 : 1;
        control.style.height = '';
      }
    });
    sizeReadOnlyTextareas();
    $('edit-btn').hidden = editing;
    $('save-btn').hidden = !editing;
    $('cancel-btn').textContent = editing ? 'Cancel edits' : 'Close';
    $('drawer-eyebrow').textContent = editing ? 'Editing job information' : 'Job details';
  }

  async function openJob(jobName) {
    openDrawer();
    $('drawer-title').textContent = jobName;
    $('job-form-content').innerHTML = '<div class="jobs-empty">Loading job details…</div>';
    try {
      const job = await api(`/jobinfo/${encodeURIComponent(jobName)}`);
      state.selected = job;
      $('drawer-title').textContent = job.job_name || jobName;
      renderForm(job);
    } catch (error) {
      showDrawerMessage('Unable to load this job record.');
      console.error(error);
    }
  }

  function openNewJob() {
    state.selected = { active: 1 };
    $('drawer-title').textContent = 'New job';
    openDrawer();
    renderForm(state.selected, true);
  }

  function openDrawer() {
    $('drawer-backdrop').hidden = false;
    $('job-drawer').classList.add('open');
    $('job-drawer').setAttribute('aria-hidden', 'false');
    $('drawer-message').hidden = true;
  }

  function closeDrawer(force = false) {
    if (!force && state.editing && state.dirty && !confirm('Discard unsaved job changes?')) return;
    $('job-drawer').classList.remove('open');
    $('job-drawer').setAttribute('aria-hidden', 'true');
    $('drawer-backdrop').hidden = true;
    state.selected = null; state.editing = false; state.dirty = false;
  }

  function showDrawerMessage(message) {
    $('drawer-message').textContent = message;
    $('drawer-message').hidden = false;
  }

  function editorToken() { return sessionStorage.getItem(EDITOR_TOKEN_KEY); }
  function requireEditor(action) {
    if (editorToken()) { action(); return; }
    state.pendingAction = action;
    $('editor-password').value = '';
    $('editor-dialog').showModal();
    setTimeout(() => $('editor-password').focus(), 0);
  }

  function updateEditorButton() {
    $('editor-btn').innerHTML = editorToken() ? '<i class="ti ti-lock-open"></i> Editor unlocked' : '<i class="ti ti-lock"></i> Editor login';
  }

  function formPayload() {
    const payload = {};
    formSections.forEach(([, fields]) => fields.forEach(([key, , kind]) => {
      if (kind === 'readonly') return;
      const control = $(`field-${key}`);
      if (!control) return;
      if (kind === 'checkbox') payload[key] = control.checked ? 1 : 0;
      else if (kind === 'number') payload[key] = control.value === '' ? null : Number(control.value);
      else payload[key] = control.value.trim() || null;
    }));
    return payload;
  }

  async function saveJob(event) {
    event.preventDefault();
    if (!state.editing) return;
    requireEditor(async () => {
      const payload = formPayload();
      if (!payload.job_name) { showDrawerMessage('Job name is required.'); return; }
      $('save-btn').disabled = true; $('save-status').textContent = 'Saving…'; $('drawer-message').hidden = true;
      try {
        await api('/jobinfo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Editor-Token': editorToken() }, body: JSON.stringify(payload) });
        state.dirty = false;
        $('save-status').textContent = 'Saved';
        await loadData();
        await openJob(payload.job_name);
      } catch (error) {
        if (String(error.message).startsWith('403')) {
          sessionStorage.removeItem(EDITOR_TOKEN_KEY); updateEditorButton();
          showDrawerMessage('The editor password was rejected. Log in and try again.');
        } else showDrawerMessage(`Save failed: ${error.message}`);
      } finally {
        $('save-btn').disabled = false;
        setTimeout(() => { $('save-status').textContent = ''; }, 2500);
      }
    });
  }

  function clearFilters() {
    $('job-search').value = '';
    ['hardware-filter', 'software-filter', 'tech-filter', 'state-filter', 'active-filter'].forEach(id => { $(id).value = ''; });
    applyFilters();
  }

  function csvCell(value) {
    let output = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@]/.test(output)) output = `'${output}`;
    return `"${output.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const selectedColumns = columns[state.preset];
    const csv = [selectedColumns.map(([, label]) => csvCell(label)).join(','), ...state.filtered.map(job => selectedColumns.map(([key]) => csvCell(job[key])).join(','))].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `isensix-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  document.querySelectorAll('.jobs-view-tab').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  ['hardware-filter', 'software-filter', 'tech-filter', 'state-filter', 'active-filter'].forEach(id => $(id).addEventListener('change', applyFilters));
  $('job-search').addEventListener('input', applyFilters);
  $('clear-filters-btn').addEventListener('click', clearFilters);
  $('refresh-btn').addEventListener('click', loadData);
  $('export-btn').addEventListener('click', exportCsv);
  $('column-preset').addEventListener('change', event => { state.preset = event.target.value; renderTable(); });
  $('jobs-table-head').addEventListener('click', event => {
    if (event.target.closest('.column-resizer')) return;
    const key = event.target.closest('th')?.dataset.sort; if (!key) return;
    if (state.sortKey === key) state.sortDir *= -1; else { state.sortKey = key; state.sortDir = 1; }
    applyFilters();
  });
  $('jobs-table-head').addEventListener('pointerdown', beginColumnResize);
  $('jobs-table-body').addEventListener('click', event => { const row = event.target.closest('tr[data-job]'); if (row) openJob(row.dataset.job); });
  $('new-job-btn').addEventListener('click', () => requireEditor(openNewJob));
  $('edit-btn').addEventListener('click', () => requireEditor(() => setEditing(true)));
  $('job-form').addEventListener('submit', saveJob);
  $('cancel-btn').addEventListener('click', () => state.editing ? renderForm(state.selected, false) : closeDrawer());
  $('drawer-close').addEventListener('click', () => closeDrawer());
  $('drawer-backdrop').addEventListener('click', () => closeDrawer());
  $('editor-btn').addEventListener('click', () => {
    if (editorToken()) { sessionStorage.removeItem(EDITOR_TOKEN_KEY); updateEditorButton(); if (state.editing) renderForm(state.selected, false); }
    else requireEditor(() => {});
  });
  $('editor-form').addEventListener('submit', event => {
    event.preventDefault();
    const token = $('editor-password').value.trim();
    if (!token) return;
    sessionStorage.setItem(EDITOR_TOKEN_KEY, token); updateEditorButton(); $('editor-dialog').close();
    const action = state.pendingAction; state.pendingAction = null; if (action) action();
  });
  $('editor-cancel').addEventListener('click', () => { state.pendingAction = null; $('editor-dialog').close(); });
  $('editor-dialog').addEventListener('close', () => { if (!editorToken()) state.pendingAction = null; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('job-drawer').classList.contains('open')) closeDrawer(); });
  window.addEventListener('resize', () => requestAnimationFrame(sizeReadOnlyTextareas));
  window.addEventListener('beforeunload', event => { if (state.editing && state.dirty) event.preventDefault(); });

  updateEditorButton();
  loadData();
})();
