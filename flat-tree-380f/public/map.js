/** Shared Leaflet map view for AP sensor locations. */
(function (global) {
  'use strict';

  const DEFAULT_CENTER = [39.5, -98.35];
  const DEFAULT_ZOOM = 4;
  const LOCATION_GROUP_METERS = 75;
  const CACHE_KEY = 'isensix_map_geocode_cache_v1';
  const geocodeCache = (() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (_) { return {}; }
  })();

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);

  function saveGeocodeCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(geocodeCache)); } catch (_) { /* storage is optional */ }
  }

  function numeric(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function coordinate(row) {
    const latitude = numeric(row._mapLatitude ?? row.latitude);
    const longitude = numeric(row._mapLongitude ?? row.longitude);
    return latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      ? [latitude, longitude]
      : null;
  }

  function validPoint(value) {
    const latitude = numeric(Array.isArray(value) ? value[0] : value?.lat);
    const longitude = numeric(Array.isArray(value) ? value[1] : value?.lng);
    return latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      ? [latitude, longitude]
      : null;
  }

  function markerColor(row) {
    if (Number(row.remaining) === 0 && Number(row.sensor_count) > 0) return '#2f9e44';
    if (Number(row.calibrated_count) > 0 || Number(row.exception_count) > 0) return '#287fd1';
    return '#7da7d9';
  }

  function cacheKey(address) {
    return String(address || '').trim().toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ');
  }

  function isPlaceholderOffsiteText(value) {
    return /^(?:\d+\s+)?offsites?\s*$/i.test(String(value || '').trim());
  }

  function looksLikeOffsiteAddress(value) {
    const text = String(value || '').trim();
    if (!text || isPlaceholderOffsiteText(text) || !/\b\d{1,6}\s+[A-Za-z]/.test(text)) return false;
    const leadingWord = text.match(/^\d{1,6}\s+([A-Za-z]+)/)?.[1] || '';
    if (/^(offsite|offsites|very|sensor|sensors)$/i.test(leadingWord)) return false;
    return /\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|parkway|pkwy|lane|ln|way|court|ct|highway|hwy|circle|cir|place|pl|terrace|ter|suite|ste)\b/i.test(text)
      || /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i.test(text);
  }

  function hasSavedLocation(row) {
    return row.location_saved === true
      || Boolean(String(row.address || '').trim())
      || Boolean(coordinate(row));
  }

  function rowKey(row) {
    return `${row.server}\u0000${row.access_point}`;
  }

  const DEFAULT_TUNNEL_HOSTNAME = 'ics1.ca.isensix.com';
  const TUNNEL_HOSTNAMES = new Set([DEFAULT_TUNNEL_HOSTNAME, 'ics3.isensix.com']);

  function tunnelHostname(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').split(/[/:?#]/)[0];
    return TUNNEL_HOSTNAMES.has(normalized) ? normalized : DEFAULT_TUNNEL_HOSTNAME;
  }

  function serverLinkHtml(server, hostname) {
    const sid = String(server || '').trim();
    if (!/^\d{3}$/.test(sid)) return escapeHtml(sid || 'Unknown SID');
    const url = `https://${tunnelHostname(hostname)}:7${sid}`;
    return `<a class="map-server-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">SID ${escapeHtml(sid)}</a>`;
  }

  const GEOCODE_TIMEOUT_MS = 8000;
  const GEOCODE_DELAY_MS = 1000;

  async function fetchGeocoderJson(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Geocoder request timed out');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function geocodeQueries(address) {
    const original = String(address || '').trim().replace(/\s+/g, ' ');
    const simplified = original
      .replace(/\s*[-,]?\s*(?:suite|ste|unit|apt|apartment|building|bldg|floor|fl|room|rm)\.?\s*(?:#?\s*[A-Za-z0-9-]+(?:\s*(?:and|&)\s*#?\s*[A-Za-z0-9-]+)?)?/gi, ' ')
      .replace(/\s+(?:rear|front|main)\s*(?:building|bldg)?\.?/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/,\s*,/g, ',')
      .replace(/\s+,/g, ',')
      .replace(/,\s+/g, ', ')
      .trim();
    return [...new Set([original, simplified])].filter(query => query.length >= 3);
  }

  async function geocode(address) {
    const key = cacheKey(address);
    if (!key) return null;
    if (geocodeCache[key]) return geocodeCache[key];
    const providers = [
      {
        name: 'Photon',
        url: query => `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`,
        coordinates: payload => payload?.features?.[0]?.geometry?.coordinates,
      },
      {
        name: 'Nominatim',
        url: query => `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
        coordinates: payload => {
          const result = Array.isArray(payload) ? payload[0] : null;
          return result ? [Number(result.lon), Number(result.lat)] : null;
        },
      },
    ];
    let lastError = null;
    for (const query of geocodeQueries(address)) {
      for (const provider of providers) {
        try {
          const coordinates = provider.coordinates(await fetchGeocoderJson(provider.url(query)));
          if (!Array.isArray(coordinates) || coordinates.length < 2) {
            lastError = new Error(`${provider.name} returned no result`);
            continue;
          }
          const result = { latitude: Number(coordinates[1]), longitude: Number(coordinates[0]) };
          if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
            lastError = new Error(`${provider.name} returned invalid coordinates`);
            continue;
          }
          geocodeCache[key] = result;
          saveGeocodeCache();
          return result;
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw lastError || new Error('No geocoder result');
  }

  function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function buildPopup(row, groupedCount = 1, fallbackJobName = '', includeJobName = true) {
    const location = [row.address, row.floor && `Floor ${row.floor}`, row.room && `Room ${row.room}`]
      .filter(Boolean).join(' · ');
    const jobName = String(row.job_name || row.server_customer || fallbackJobName || '').trim();
    const sharedLocation = String(row.location_name || '').trim();
    const coordinateSource = row.ap_location_source || row.location_source;
    const source = row._mapFromAddress
      ? 'Address geocoded for this view'
      : coordinateSource === 'manual'
        ? 'Manually moved pin'
        : coordinateSource === 'gps'
          ? 'GPS coordinates captured'
          : 'Saved coordinates';
    const adjustKey = encodeURIComponent(rowKey(row));
    return `<details class="map-ap-details">
      <summary><span class="map-ap-summary-name">${escapeHtml(row.access_point)}</span><span class="map-ap-summary-count">${Number(row.sensor_count) || 0} sensors</span></summary>
      <div class="map-ap-detail-body">
        ${includeJobName && jobName ? `<div class="map-job-name">${escapeHtml(jobName)}</div>` : ''}
        ${serverLinkHtml(row.server, row.server_hostname)} · ${Number(row.sensor_count) || 0} sensors<br>
        ${Number(row.calibrated_count) || 0} calibrated · ${Number(row.remaining) || 0} remaining<br>
        ${sharedLocation ? `<span class="map-location-name">${escapeHtml(sharedLocation)}</span><br>` : ''}
        ${location ? `${escapeHtml(location)}<br>` : ''}
        <small>${escapeHtml(source)}${groupedCount > 1 ? ` · ${groupedCount} APs at this point` : ''}</small><br>
        <button type="button" class="map-pin-adjust" data-map-adjust="${escapeHtml(adjustKey)}">Move pin</button>
        <button type="button" class="map-location-edit" data-map-location="${escapeHtml(adjustKey)}">${row.location_id ? 'Edit location details' : 'Add location details'}</button>
      </div>
    </details>`;
  }

  function buildDashboardPopup(group, page = 0, options = {}) {
    const pageSize = 5;
    const pageCount = Math.max(1, Math.ceil(group.rows.length / pageSize));
    const currentPage = Math.min(Math.max(0, Number(page) || 0), pageCount - 1);
    const pageRows = group.rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    const { sensorCount: totalSensors, remaining: totalRemaining, calibrated: totalCalibrated } = groupSummary(group.rows);
    const locationIds = [...new Set(group.rows.map(row => Number(row.location_id)).filter(id => Number.isInteger(id) && id > 0))];
    const sharedLocationId = locationIds.length === 1 && group.rows.every(row => Number(row.location_id) === locationIds[0])
      ? locationIds[0]
      : null;
    const groupAdjust = group.rows.length > 1
      ? '<button type="button" class="map-pin-adjust" data-map-adjust-group="true">Move all APs together</button>'
      : '';
    const groupLocationAction = `<button type="button" class="map-location-edit" data-map-location-group="true">${sharedLocationId ? 'Edit location details' : 'Create location details'}</button>`;
    const sharedLocationDetails = sharedLocationId ? locationDetailsHtml(group.rows[0]) : '';
    const rowsByJob = new Map();
    pageRows.forEach(row => {
      const name = String(row.job_name || row.server_customer || options.jobName || '').trim() || 'Unassigned job';
      if (!rowsByJob.has(name)) rowsByJob.set(name, []);
      rowsByJob.get(name).push(row);
    });
    const jobNames = [...rowsByJob.keys()];
    const groupJobName = jobNames.length === 1 ? jobNames[0] : '';
    const jobSections = [...rowsByJob.entries()].map(([jobName, rowsForJob]) =>
      `<div class="map-job-section">${jobNames.length > 1 ? `<strong class="map-job-name">${escapeHtml(jobName)}</strong>` : ''}${rowsForJob.map(row => buildPopup(row, group.rows.length, '', false)).join('<hr>')}</div>`
    ).join('');
    const pagination = pageCount > 1
      ? `<div class="map-job-pagination"><button type="button" data-map-page="${currentPage - 1}" ${currentPage === 0 ? 'disabled' : ''}>Previous</button><span>APs ${currentPage * pageSize + 1}-${Math.min(group.rows.length, (currentPage + 1) * pageSize)} of ${group.rows.length}</span><button type="button" data-map-page="${currentPage + 1}" ${currentPage >= pageCount - 1 ? 'disabled' : ''}>Next</button></div>`
      : '';
    return `<div class="map-location-summary">${groupJobName ? `<strong class="map-job-name">${escapeHtml(groupJobName)}</strong>` : jobNames.length > 1 ? `<strong class="map-job-name">${jobNames.length} jobs at this location</strong>` : ''}${sharedLocationId && group.rows[0].location_name ? `<strong class="map-location-name">${escapeHtml(group.rows[0].location_name)}</strong>` : ''}${sharedLocationDetails}<strong>${totalSensors} sensors at this location</strong><span>${group.rows.length} AP${group.rows.length === 1 ? '' : 's'} &middot; ${totalCalibrated} calibrated &middot; ${totalRemaining} remaining</span><div class="map-location-actions">${groupLocationAction}${groupAdjust}</div></div><div data-map-popup-page>${jobSections}${pagination}</div>`;
  }


  function groupSummary(rows) {
    const sensorCount = rows.reduce((sum, row) => sum + (Number(row.sensor_count) || 0), 0);
    const remaining = rows.reduce((sum, row) => sum + (Number(row.remaining) || 0), 0);
    const calibrated = rows.reduce((sum, row) => sum + (Number(row.calibrated_count) || 0), 0);
    return { sensorCount, remaining, calibrated };
  }

  function locationDetailsHtml(row) {
    if (!row?.location_id) return '';
    const details = [
      row.access_hours && `Hours: ${row.access_hours}`,
      row.contact_name && `Contact: ${row.contact_name}`,
      row.contact_phone,
      row.contact_email,
    ].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join('<br>');
    const notes = String(row.location_notes || '').trim();
    return details || notes
      ? `<div class="map-location-details">${details}${notes ? `${details ? '<br>' : ''}<span>${escapeHtml(notes)}</span>` : ''}</div>`
      : '';
  }

  function locationGroupKey(point) {
    const [latitude, longitude] = point;
    const latitudeStep = LOCATION_GROUP_METERS / 111320;
    const longitudeStep = LOCATION_GROUP_METERS / (111320 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
    return `${Math.round(latitude / latitudeStep)}:${Math.round(longitude / longitudeStep)}`;
  }

  function legacyOffsiteRows(job) {
    const raw = String(job.offsites || '').trim();
    if (!raw || /^(none|no|n\/a|na|unknown|0)$/i.test(raw)) return [];
    const fullAddresses = [...new Set((raw.match(/\b\d{1,6}\s+[^,\n]+,\s*[^,\n]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gi) || []).map(value => value.trim()))];
    const candidates = fullAddresses.length > 1 ? fullAddresses : raw.split(/\r?\n+/).map(value => value.trim()).filter(value => {
      return value && !/^https?:\/\//i.test(value) && looksLikeOffsiteAddress(value);
    });
    return candidates.map((value, index) => {
      const address = value
        .replace(/^\d+\s+sensors?\s+at\s*:?\s*/i, '')
        .replace(/^off[- ]?site\s*:?\s*/i, '')
        .trim();
      return {
        job_id: job.job_id,
        job_name: job.job_name,
        customer: job.customer,
        location_kind: 'legacy_offsite',
        location_role: 'offsite',
        name: `Offsite ${index + 1}`,
        address,
        notes: raw,
        sensor_count: 0,
        job_sensors: Number(job.sensors) || 0,
        calibrated_count: 0,
        exception_count: 0,
        remaining: 0,
      };
    });
  }

  function jobRows(payload) {
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    const jobById = new Map(jobs.map(job => [String(job.job_id), job]));
    const structuredLocations = Array.isArray(payload?.locations) ? payload.locations : [];
    const adoptedMainLocationIds = new Set();
    const mainLocations = new Map();
    structuredLocations.forEach(location => {
      const job = jobById.get(String(location.job_id));
      const matchesMainAddress = location.location_role !== 'main_site'
        && job
        && /^(none|no|n\/a|na|unknown|0)$/i.test(String(job.offsites || '').trim())
        && cacheKey(location.physical_location_address || location.address) === cacheKey(job.site_address);
      if (location.location_role === 'main_site' || matchesMainAddress) {
        mainLocations.set(String(location.job_id), location);
        if (location.job_location_id) adoptedMainLocationIds.add(Number(location.job_location_id));
      }
    });
    const rows = [];
    jobs.forEach(job => {
      const savedMain = mainLocations.get(String(job.job_id));
      rows.push({
        ...job,
        ...savedMain,
        location_kind: 'job_site',
        location_role: 'main_site',
        name: savedMain?.name || 'Main site',
        address: savedMain?.physical_location_address || savedMain?.address || job.site_address || '',
        latitude: savedMain?.physical_location_latitude ?? savedMain?.latitude,
        longitude: savedMain?.physical_location_longitude ?? savedMain?.longitude,
        location_source: savedMain?.physical_location_source || savedMain?.location_source,
        job_location_id: savedMain?.job_location_id || null,
        sensor_count: Number(job.sensors) || 0,
        job_sensors: Number(job.sensors) || 0,
        calibrated_count: 0,
        exception_count: 0,
        remaining: Number(job.sensors) || 0,
      });
    });
    structuredLocations.filter(location => location.location_role !== 'main_site'
      && !isPlaceholderOffsiteText(location.address)
      && !adoptedMainLocationIds.has(Number(location.job_location_id))).forEach(location => rows.push({
      ...location,
      location_kind: 'job_location',
      address: location.physical_location_address || location.address || '',
      latitude: location.physical_location_latitude ?? location.latitude,
      longitude: location.physical_location_longitude ?? location.longitude,
      location_source: location.physical_location_source || location.location_source,
      name: location.name || location.physical_location_name || (location.location_role === 'main_site' ? 'Main site' : 'Offsite'),
      sensor_count: 0,
      job_sensors: Number(location.sensors) || 0,
      calibrated_count: 0,
      exception_count: 0,
      remaining: 0,
    }));
    (payload?.ap_locations || []).forEach(location => {
      const job = jobById.get(String(location.job_id));
      const savedMain = mainLocations.get(String(location.job_id));
      const hasApCoordinates = location.latitude !== null && location.latitude !== undefined
        && location.longitude !== null && location.longitude !== undefined;
      rows.push({
        ...location,
        location_kind: 'sensor_location',
        location_role: 'sensor_location',
        name: location.physical_location_name || location.access_point,
        job_name: location.job_name || job?.job_name || location.server_customer || '',
        customer: job?.customer || location.server_customer || '',
        ap_address: location.address || '',
        address: location.address || savedMain?.physical_location_address || savedMain?.address || job?.site_address || '',
        latitude: location.latitude ?? savedMain?.physical_location_latitude ?? savedMain?.latitude,
        longitude: location.longitude ?? savedMain?.physical_location_longitude ?? savedMain?.longitude,
        uses_job_fallback: !location.address && !hasApCoordinates,
        job_sensors: Number(job?.sensors) || 0,
      });
    });
    const structuredOffsiteKeys = new Set(structuredLocations
      .filter(location => location.location_role !== 'main_site' && (location.physical_location_address || location.address))
      .map(location => `${location.job_id}|${cacheKey(location.physical_location_address || location.address)}`));
    jobs.forEach(job => legacyOffsiteRows(job)
      .filter(row => !structuredOffsiteKeys.has(`${row.job_id}|${cacheKey(row.address)}`))
      .forEach(row => rows.push(row)));
    return rows;
  }

  function jobRoleLabel(row) {
    if (row.location_kind === 'job_site') return 'Main site';
    if (row.location_kind === 'sensor_location') return 'Mapped sensor location';
    return 'Offsite';
  }

  function jobLocationDetails(row) {
    const details = [
      row.access_hours && `Hours: ${row.access_hours}`,
      row.contact_name && `Contact: ${row.contact_name}`,
      row.contact_phone,
      row.contact_email,
      row.physical_location_notes,
      row.notes && row.location_kind !== 'legacy_offsite' && row.notes,
    ].filter(Boolean);
    return details.length ? `<div class="map-location-details">${details.map(value => escapeHtml(value)).join('<br>')}</div>` : '';
  }

  const JOB_POPUP_PAGE_SIZE = 5;

  function locationSensorCount(group) {
    const countsByJob = new Map();
    let orphanCount = 0;
    group.rows.filter(row => row.location_kind === 'sensor_location').forEach(row => {
      const count = Number(row.sensor_count) || 0;
      if (row.job_id) countsByJob.set(String(row.job_id), (countsByJob.get(String(row.job_id)) || 0) + count);
      else orphanCount += count;
    });
    group.rows.filter(row => row.location_kind === 'job_site' && row.job_id).forEach(row => {
      const key = String(row.job_id);
      if (!countsByJob.has(key)) countsByJob.set(key, Number(row.job_sensors) || 0);
    });
    return [...countsByJob.values()].reduce((sum, count) => sum + count, orphanCount);
  }

  function buildJobApSection(group, page = 0) {
    const sensorRows = group.rows.filter(row => row.location_kind === 'sensor_location' && row.access_point);
    if (!sensorRows.length) return '';
    const pageCount = Math.max(1, Math.ceil(sensorRows.length / JOB_POPUP_PAGE_SIZE));
    const currentPage = Math.min(Math.max(0, Number(page) || 0), pageCount - 1);
    const pageRows = sensorRows.slice(currentPage * JOB_POPUP_PAGE_SIZE, (currentPage + 1) * JOB_POPUP_PAGE_SIZE);
    const apRows = pageRows.map(row => `<div class="map-job-ap-row"><div><strong>${escapeHtml(row.access_point)}</strong><span>${escapeHtml(row.job_name || row.customer || 'Unassigned job')} &middot; ${Number(row.sensor_count) || 0} sensors</span>${row.address ? `<span>${escapeHtml(row.address)}</span>` : ''}</div><button type="button" class="map-pin-adjust" data-map-move-ap="${escapeHtml(encodeURIComponent(rowKey(row)))}">Move pin</button></div>`).join('');
    const pageStart = currentPage * JOB_POPUP_PAGE_SIZE + 1;
    const pageEnd = Math.min(sensorRows.length, (currentPage + 1) * JOB_POPUP_PAGE_SIZE);
    const pageControls = pageCount > 1 ? `<div class="map-job-pagination"><button type="button" data-map-page="${currentPage - 1}" ${currentPage === 0 ? 'disabled' : ''}>Previous</button><span>APs ${pageStart}-${pageEnd} of ${sensorRows.length}</span><button type="button" data-map-page="${currentPage + 1}" ${currentPage >= pageCount - 1 ? 'disabled' : ''}>Next</button></div>` : '';
    const moveAll = sensorRows.length > 1 ? `<button type="button" class="map-pin-adjust" data-map-move-all>Move all ${sensorRows.length} APs</button>` : '';
    return `<section class="map-job-ap-section"><div class="map-job-ap-heading"><strong>Access points</strong><span>${sensorRows.length} APs at this location</span>${moveAll}</div>${apRows}${pageControls}</section>`;
  }

  function buildJobPopup(group, page = 0) {
    const groupedJobs = new Map();
    group.rows.forEach(row => {
      const key = String(row.job_id || row.job_name || row.customer || 'unassigned');
      if (!groupedJobs.has(key)) groupedJobs.set(key, []);
      groupedJobs.get(key).push(row);
    });
    const jobSections = [...groupedJobs.values()].map(rowsForJob => {
      const first = rowsForJob[0];
      const name = String(first.job_name || first.customer || 'Unassigned job').trim();
      const href = first.job_name ? `jobs.html?job=${encodeURIComponent(first.job_name)}` : 'jobs.html';
      const job = group.jobsById.get(String(first.job_id));
      const totalSensors = Number(job?.sensors ?? job?.job_sensors) || rowsForJob.reduce((sum, row) => sum + (Number(row.sensor_count) || 0), 0);
      const locationRows = rowsForJob.filter(row => row.location_kind !== 'sensor_location').map(row => {
        const mappedSensors = Number(row.sensor_count) || 0;
        const address = String(row.address || '').trim();
        const label = row.name || row.access_point || jobRoleLabel(row);
        const moveJob = row.location_kind === 'job_site' && row.job_id && coordinate(row)
          ? `<button type="button" class="map-pin-adjust" data-map-move-job="${escapeHtml(String(row.job_id))}">Move main site pin</button>`
          : '';
        const moveLocationKey = row.job_location_id
          ? `id:${row.job_location_id}`
          : `key:${encodeURIComponent(`${row.job_id || ''}|${cacheKey(row.address)}`)}`;
        const moveLocation = row.location_kind === 'job_location' || row.location_kind === 'legacy_offsite'
          ? `<button type="button" class="map-pin-adjust" data-map-move-location="${escapeHtml(moveLocationKey)}">Move location</button>`
          : '';
        const deleteLocation = row.job_location_id && row.location_role === 'offsite'
          ? `<button type="button" class="map-pin-adjust map-location-delete" data-map-delete-location="${escapeHtml(String(row.job_location_id))}">Delete location</button>`
          : '';
        return `<div class="map-job-location-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(jobRoleLabel(row))}${mappedSensors ? ` · ${mappedSensors} sensors mapped here` : ''}</span>${address ? `<span>${escapeHtml(address)}</span>` : ''}${jobLocationDetails(row)}<span class="map-location-actions">${moveJob}${moveLocation}${deleteLocation}</span></div>`;
      }).join('');
      const legacyValue = rowsForJob.find(row => row.location_kind === 'legacy_offsite')?.notes
        || rowsForJob.find(row => row.location_kind === 'job_site')?.offsites || '';
      const legacyNote = /^(none|no|n\/a|na|unknown|0)$/i.test(String(legacyValue).trim()) ? '' : legacyValue;
      return `<section class="map-job-section"><a class="map-job-name map-job-link" href="${escapeHtml(href)}">${escapeHtml(name)}</a><span>Job total: ${totalSensors} sensors</span>${locationRows}${legacyNote ? `<div class="map-location-details"><strong>Existing offsite notes:</strong><br>${escapeHtml(legacyNote)}</div>` : ''}</section>`;
    }).join('');
    const jobCount = groupedJobs.size;
    const sensorRows = group.rows.filter(row => row.location_kind === 'sensor_location' && row.access_point);
    const apSection = buildJobApSection(group, page);
    const recordCount = sensorRows.length || group.rows.length;
    return `<div class="map-location-summary"><strong>${group.sensorCount} sensors represented at this location</strong><span>${jobCount} job${jobCount === 1 ? '' : 's'} &middot; ${recordCount} mapped record${recordCount === 1 ? '' : 's'}</span></div>${jobSections}${apSection}`;
  }

  function mountJobs(options) {
    const container = typeof options.container === 'string' ? document.getElementById(options.container) : options.container;
    if (!container) return null;
    if (!global.L) {
      container.innerHTML = '<div class="map-empty">Map library could not be loaded.</div>';
      return null;
    }
    const status = options.status ? document.getElementById(options.status) : null;
    const list = options.list ? document.getElementById(options.list) : null;
    const refreshButton = options.refresh ? document.getElementById(options.refresh) : null;
    const geocodeButton = options.geocode ? document.getElementById(options.geocode) : null;
    const searchInput = options.search ? document.getElementById(options.search) : null;
    const map = global.L.map(container, { scrollWheelZoom: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    global.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    let rows = [];
    let markers = [];
    let editState = null;
    let searchTerm = '';

    function setStatus(message) { if (status) status.textContent = message; }

    function jobCoordinate(row) {
      const point = coordinate(row);
      if (!point || point[0] < 17 || point[0] > 72 || point[1] < -180 || point[1] > -60) return null;
      return point;
    }

    function closePinEditor() {
      if (!editState) return;
      editState.marker.remove();
      editState.editor.remove();
      editState = null;
    }

    async function saveApPin() {
      if (!editState) return;
      const { rows: editRows, marker, editor } = editState;
      const point = marker.getLatLng();
      const saveButton = editor.querySelector('[data-map-pin-save]');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
      try {
        const response = await fetch(`${CONFIG.WORKER_URL}/ap-locations/batch`, {
          method: 'POST',
          headers: { ...(typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {}), 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: editRows.map(row => ({
            server: row.server,
            access_point: row.access_point,
            address: row.ap_address || '',
            floor: row.floor || '',
            room: row.room || '',
            notes: row.notes || '',
            latitude: point.lat,
            longitude: point.lng,
            location_source: 'manual',
          })) }),
        });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        editRows.forEach(row => {
          row.latitude = point.lat;
          row.longitude = point.lng;
          row.location_source = 'manual';
          row.location_saved = true;
          row.coordinates_saved = true;
          row._mapLatitude = point.lat;
          row._mapLongitude = point.lng;
          row._mapFromAddress = false;
        });
        closePinEditor();
        renderMarkers(true);
        setStatus(`Saved manual pin for ${editRows.length} AP${editRows.length === 1 ? '' : 's'}`);
      } catch (error) {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save pin'; }
        setStatus(`AP pin could not be saved: ${error.message}`);
      }
    }

    function beginApPinEdit(rowsToMove) {
      const editRows = (Array.isArray(rowsToMove) ? rowsToMove : [rowsToMove])
        .filter(row => row?.server && row?.access_point);
      const point = jobCoordinate(editRows[0]);
      if (!editRows.length || !point) {
        setStatus('This AP does not have a map point yet. Map its address first.');
        return;
      }
      closePinEditor();
      const marker = global.L.marker(point, { draggable: true, autoPan: true }).addTo(map);
      const editor = document.createElement('div');
      editor.className = 'map-pin-editor';
      editor.innerHTML = `<strong>Move ${editRows.length} AP${editRows.length === 1 ? '' : 's'} · ${editRows.reduce((sum, row) => sum + (Number(row.sensor_count) || 0), 0)} sensors</strong><span data-map-pin-coordinates>Drag the pin to the actual location.</span><div><button type="button" data-map-pin-cancel>Cancel</button><button type="button" class="primary" data-map-pin-save>Save pin</button></div>`;
      container.appendChild(editor);
      editState = { rows: editRows, marker, editor };
      const coordinates = editor.querySelector('[data-map-pin-coordinates]');
      marker.on('drag', event => {
        const current = event.target.getLatLng();
        coordinates.textContent = `${current.lat.toFixed(6)}, ${current.lng.toFixed(6)}`;
      });
      editor.querySelector('[data-map-pin-cancel]')?.addEventListener('click', closePinEditor);
      editor.querySelector('[data-map-pin-save]')?.addEventListener('click', saveApPin);
      marker.bindTooltip('Drag to move this AP pin', { permanent: true, direction: 'top', offset: [0, -8] }).openTooltip();
      setStatus(`Moving ${editRows.length} AP${editRows.length === 1 ? '' : 's'} at one location`);
    }

    async function saveJobPin() {
      if (!editState) return;
      const { rows: editRows, marker, editor } = editState;
      const row = editRows[0];
      const point = marker.getLatLng();
      const saveButton = editor.querySelector('[data-map-pin-save]');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
      try {
        const response = await fetch(`${CONFIG.WORKER_URL}/job-locations/batch`, {
          method: 'POST',
          headers: { ...(typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {}), 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: [{
            id: row.job_location_id || null,
            job_info_id: row.job_id,
            location_role: 'main_site',
            name: row.name || 'Main site',
            address: row.address || '',
            latitude: point.lat,
            longitude: point.lng,
            location_source: 'manual',
            notes: row.notes || null,
          }] }),
        });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        const payload = await response.json();
        const savedId = Number(payload.ids?.[0] || row.job_location_id) || null;
        const mainAddress = row.address || '';
        rows.filter(candidate => String(candidate.job_id) === String(row.job_id)).forEach(candidate => {
          if (candidate.location_kind === 'job_site') candidate.job_location_id = savedId;
          if (candidate.location_kind === 'job_site' || candidate.uses_job_fallback) {
            candidate.latitude = point.lat;
            candidate.longitude = point.lng;
            candidate._mapLatitude = point.lat;
            candidate._mapLongitude = point.lng;
            candidate._mapFromAddress = false;
            if (candidate.uses_job_fallback) candidate.address = candidate.ap_address || mainAddress;
          }
        });
        closePinEditor();
        renderMarkers(true);
        setStatus(`Saved main-site pin for ${row.job_name || row.customer || 'job'}; new unmapped APs will use it by default.`);
      } catch (error) {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save pin'; }
        setStatus(`Job site pin could not be saved: ${error.message}`);
      }
    }

    function beginJobPinEdit(row) {
      const point = jobCoordinate(row);
      if (!point) {
        setStatus('Map the main-site address first, then move its pin.');
        return;
      }
      closePinEditor();
      const marker = global.L.marker(point, { draggable: true, autoPan: true }).addTo(map);
      const editor = document.createElement('div');
      editor.className = 'map-pin-editor';
      editor.innerHTML = `<strong>Move ${escapeHtml(row.job_name || row.customer || 'job')} main-site pin</strong><span data-map-pin-coordinates>Drag the pin to the actual location. Future unmapped APs for this job will use it.</span><div><button type="button" data-map-pin-cancel>Cancel</button><button type="button" class="primary" data-map-pin-save>Save pin</button></div>`;
      container.appendChild(editor);
      editState = { rows: [row], marker, editor };
      const coordinates = editor.querySelector('[data-map-pin-coordinates]');
      marker.on('drag', event => {
        const current = event.target.getLatLng();
        coordinates.textContent = `${current.lat.toFixed(6)}, ${current.lng.toFixed(6)}`;
      });
      editor.querySelector('[data-map-pin-cancel]')?.addEventListener('click', closePinEditor);
      editor.querySelector('[data-map-pin-save]')?.addEventListener('click', saveJobPin);
      marker.bindTooltip('Drag to move this job site pin', { permanent: true, direction: 'top', offset: [0, -8] }).openTooltip();
      setStatus(`Moving main-site pin for ${row.job_name || row.customer || 'job'}`);
    }

    function rowMatchesSearch(row) {
      if (!searchTerm) return true;
      return [row.job_name, row.customer, row.address, row.name, row.access_point, row.server]
        .some(value => String(value || '').toLowerCase().includes(searchTerm));
    }

    function visibleRows() {
      return rows.filter(rowMatchesSearch);
    }

    function addressOnlyRows(sourceRows = rows) {
      return sourceRows.filter(row => !jobCoordinate(row) && String(row.address || '').trim());
    }

    function geocodeTargetRows(sourceRows = rows) {
      return addressOnlyRows(sourceRows).filter(row => row.location_kind !== 'sensor_location' || !row.uses_job_fallback);
    }

    function uniqueAddressRows(sourceRows) {
      return [...new Map(sourceRows.map(row => [cacheKey(row.address), row])).values()];
    }

    function addressRowKey(row) {
      return `${row.job_id || ''}|${cacheKey(row.address)}`;
    }

    function manualApForJob(row) {
      if (row.location_role !== 'offsite') return null;
      const candidates = rows.filter(candidate => candidate.location_kind === 'sensor_location'
        && String(candidate.job_id) === String(row.job_id)
        && !candidate.uses_job_fallback
        && (candidate.ap_location_source === 'manual' || jobCoordinate(candidate))
        && jobCoordinate(candidate));
      const mainRow = rows.find(candidate => candidate.location_kind === 'job_site'
        && String(candidate.job_id) === String(row.job_id)
        && jobCoordinate(candidate));
      const offsiteCandidates = mainRow
        ? candidates.filter(candidate => locationGroupKey(jobCoordinate(candidate)) !== locationGroupKey(jobCoordinate(mainRow)))
        : candidates;
      return offsiteCandidates.length === 1 ? offsiteCandidates[0] : null;
    }

    async function persistJobLocationRows(sourceRows) {
      const saveRows = sourceRows.filter(row => row.job_id && row.address && row._mapLatitude !== undefined && row._mapLongitude !== undefined);
      const uniqueSaveRows = [...new Map(saveRows.map(row => [
        `${row.job_id}|${row.job_location_id || row.location_kind}|${cacheKey(row.address)}`,
        row,
      ])).values()];
      if (!uniqueSaveRows.length) return { count: 0, ids: [], error: '' };
      try {
        const headers = {
          ...(typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {}),
          'Content-Type': 'application/json',
        };
        const response = await fetch(`${CONFIG.WORKER_URL}/job-locations/batch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ locations: uniqueSaveRows.map(row => ({
            id: row.job_location_id || null,
            job_info_id: row.job_id,
            location_role: row.location_role === 'main_site' ? 'main_site' : 'offsite',
            name: row.name || (row.location_role === 'main_site' ? 'Main site' : 'Offsite'),
            address: row.address,
            latitude: row._mapLatitude,
            longitude: row._mapLongitude,
            location_source: row.location_source || 'address_geocode',
            notes: row.notes || null,
          })) }),
        });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        const payload = await response.json();
        uniqueSaveRows.forEach((row, index) => {
          if (payload.ids?.[index]) row.job_location_id = Number(payload.ids[index]);
        });
        return { count: uniqueSaveRows.length, ids: payload.ids || [], error: '' };
      } catch (error) {
        return { count: 0, ids: [], error: ` Coordinates were mapped for this view but could not be saved (${error.message}).` };
      }
    }

    async function mapSingleAddress(row, useManualAp = false) {
      const manualAp = useManualAp ? manualApForJob(row) : null;
      if (useManualAp && !manualAp) {
        setStatus('This offsite does not have exactly one manually moved AP to use as its location.');
        return;
      }
      setStatus(`${useManualAp ? 'Using the AP pin' : 'Mapping address'} for ${row.job_name || row.customer || 'offsite'}…`);
      try {
        const result = manualAp ? jobCoordinate(manualAp) : await geocode(row.address);
        const latitude = Array.isArray(result) ? result[0] : result?.latitude;
        const longitude = Array.isArray(result) ? result[1] : result?.longitude;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('No coordinates were returned');
        rows.filter(candidate => addressRowKey(candidate) === addressRowKey(row)).forEach(candidate => {
          candidate._mapLatitude = latitude;
          candidate._mapLongitude = longitude;
          candidate._mapFromAddress = !useManualAp;
          candidate.location_source = useManualAp ? 'manual' : 'address_geocode';
        });
        row._mapLatitude = latitude;
        row._mapLongitude = longitude;
        row._mapFromAddress = !useManualAp;
        row.location_source = useManualAp ? 'manual' : 'address_geocode';
        const saved = await persistJobLocationRows([row]);
        renderMarkers(true);
        renderList();
        const counts = mapCounts(visibleRows());
        if (geocodeButton) geocodeButton.hidden = counts.distinctAddressOnly === 0;
        setStatus(`${useManualAp ? 'Linked AP pin' : 'Mapped address'} for ${row.job_name || row.customer || 'offsite'}${saved.count ? ' and saved it' : ''}${saved.error}`);
      } catch (error) {
        setStatus(`Address could not be mapped: ${error.message} Use Place pin to set it manually.`);
      }
    }

    async function saveAddressPin() {
      if (!editState) return;
      const { rows: editRows, marker, editor } = editState;
      const row = editRows[0];
      const point = marker.getLatLng();
      const saveButton = editor.querySelector('[data-map-pin-save]');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
      try {
        const matchingRows = rows.filter(candidate => String(candidate.job_id) === String(row.job_id)
          && cacheKey(candidate.address) === cacheKey(row.address));
        matchingRows.forEach(candidate => {
          candidate._mapLatitude = point.lat;
          candidate._mapLongitude = point.lng;
          candidate._mapFromAddress = false;
          candidate.location_source = 'manual';
        });
        const saved = await persistJobLocationRows(matchingRows.length ? matchingRows : [row]);
        closePinEditor();
        renderMarkers(true);
        setStatus(`Saved manual location for ${row.job_name || row.customer || 'offsite'}${saved.error}`);
      } catch (error) {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save pin'; }
        setStatus(`Location could not be saved: ${error.message}`);
      }
    }

    function beginAddressPinEdit(row) {
      const mainRow = rows.find(candidate => candidate.location_kind === 'job_site'
        && String(candidate.job_id) === String(row.job_id)
        && jobCoordinate(candidate));
      const point = mainRow ? jobCoordinate(mainRow) : map.getCenter();
      closePinEditor();
      const marker = global.L.marker(point, { draggable: true, autoPan: true }).addTo(map);
      const editor = document.createElement('div');
      editor.className = 'map-pin-editor';
      editor.innerHTML = `<strong>Place ${escapeHtml(row.job_name || row.customer || 'offsite')}</strong><span data-map-pin-coordinates>Drag this pin to the address or offsite location.</span><div><button type="button" data-map-pin-cancel>Cancel</button><button type="button" class="primary" data-map-pin-save>Save pin</button></div>`;
      container.appendChild(editor);
      editState = { rows: [row], marker, editor };
      map.setView(point, Math.max(map.getZoom(), mainRow ? 14 : 4));
      const coordinates = editor.querySelector('[data-map-pin-coordinates]');
      marker.on('drag', event => {
        const current = event.target.getLatLng();
        coordinates.textContent = `${current.lat.toFixed(6)}, ${current.lng.toFixed(6)}`;
      });
      editor.querySelector('[data-map-pin-cancel]')?.addEventListener('click', closePinEditor);
      editor.querySelector('[data-map-pin-save]')?.addEventListener('click', saveAddressPin);
      marker.bindTooltip('Drag to place this location', { permanent: true, direction: 'top', offset: [0, -8] }).openTooltip();
      setStatus(`Placing ${row.job_name || row.customer || 'offsite'}; drag the pin and save it.`);
    }

    function beginMappedLocationEdit(row) {
      const point = jobCoordinate(row);
      if (!point) {
        setStatus('This location has an invalid coordinate. Use Place pin from the address list to replace it.');
        return;
      }
      closePinEditor();
      const marker = global.L.marker(point, { draggable: true, autoPan: true }).addTo(map);
      const editor = document.createElement('div');
      editor.className = 'map-pin-editor';
      editor.innerHTML = `<strong>Move ${escapeHtml(row.name || 'offsite location')}</strong><span data-map-pin-coordinates>Drag this pin to the correct location.</span><div><button type="button" data-map-pin-cancel>Cancel</button><button type="button" class="primary" data-map-pin-save>Save pin</button></div>`;
      container.appendChild(editor);
      editState = { rows: [row], marker, editor };
      const coordinates = editor.querySelector('[data-map-pin-coordinates]');
      marker.on('drag', event => {
        const current = event.target.getLatLng();
        coordinates.textContent = `${current.lat.toFixed(6)}, ${current.lng.toFixed(6)}`;
      });
      editor.querySelector('[data-map-pin-cancel]')?.addEventListener('click', closePinEditor);
      editor.querySelector('[data-map-pin-save]')?.addEventListener('click', saveAddressPin);
      marker.bindTooltip('Drag to move this location', { permanent: true, direction: 'top', offset: [0, -8] }).openTooltip();
      setStatus(`Moving ${row.name || 'offsite location'}`);
    }

    async function deleteJobLocation(row) {
      const id = Number(row?.job_location_id);
      if (!id) {
        setStatus('This is a legacy note without a saved structured location. Use Place pin to replace it.');
        return;
      }
      if (!window.confirm(`Delete the saved map location for ${row.name || row.address || 'this offsite'}?`)) return;
      try {
        const response = await fetch(`${CONFIG.WORKER_URL}/job-locations/${id}`, {
          method: 'DELETE',
          headers: typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {},
        });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        rows = rows.filter(candidate => Number(candidate.job_location_id) !== id);
        renderMarkers(true);
        setStatus(`Deleted saved map location for ${row.name || row.address || 'offsite'}`);
      } catch (error) {
        setStatus(`Location could not be deleted: ${error.message}`);
      }
    }

    function mapCounts(sourceRows = rows) {
      const mappedRows = sourceRows.filter(row => jobCoordinate(row));
      const apRows = sourceRows.filter(row => row.location_kind === 'sensor_location');
      const addressOnly = addressOnlyRows(sourceRows);
      return {
        jobs: new Set(sourceRows.map(row => row.job_id).filter(Boolean)).size,
        physicalLocations: new Set(mappedRows.map(row => locationGroupKey(jobCoordinate(row)))).size,
        mappedApRecords: apRows.filter(row => jobCoordinate(row)).length,
        distinctAddressOnly: uniqueAddressRows(addressOnly).length,
        addressOnlyApRecords: apRows.filter(row => !jobCoordinate(row) && String(row.address || '').trim()).length,
      };
    }

    function renderList() {
      if (!list) return;
      const sourceRows = visibleRows();
      const counts = mapCounts(sourceRows);
      const missingRows = uniqueAddressRows(addressOnlyRows(sourceRows)).slice(0, 100);
      const missing = missingRows.map(row => {
        const key = escapeHtml(encodeURIComponent(addressRowKey(row)));
        const manualAp = manualApForJob(row);
        return `<div class="map-unmapped-row"><span>${escapeHtml(row.job_name || row.customer || 'Unassigned job')} &middot; ${escapeHtml(row.address)}</span><span class="map-unmapped-actions"><button type="button" data-map-address="${key}">Map address</button><button type="button" data-map-place-pin="${key}">Place pin</button>${manualAp ? `<button type="button" data-map-use-ap="${key}">Use AP pin</button>` : ''}</span></div>`;
      }).join('');
      list.innerHTML = `<div class="map-summary"><span><strong>${counts.jobs}</strong> active jobs</span><span><strong>${counts.physicalLocations}</strong> distinct mapped locations</span><span><strong>${counts.mappedApRecords}</strong> AP records mapped</span><span><strong>${counts.distinctAddressOnly}</strong> distinct addresses awaiting geocode</span><span><strong>${counts.addressOnlyApRecords}</strong> AP records awaiting location</span></div>${missing ? `<div class="map-unmapped-list"><strong>Distinct addresses awaiting geocode</strong>${missing}</div>` : ''}`;
      list.querySelectorAll('[data-map-address], [data-map-place-pin], [data-map-use-ap]').forEach(button => {
        button.addEventListener('click', () => {
          const decoded = decodeURIComponent(button.dataset.mapAddress || button.dataset.mapPlacePin || button.dataset.mapUseAp || '');
          const row = missingRows.find(candidate => addressRowKey(candidate) === decoded);
          if (!row) return;
          if (button.dataset.mapPlacePin) beginAddressPinEdit(row);
          else mapSingleAddress(row, Boolean(button.dataset.mapUseAp));
        });
      });
    }

    function renderMarkers(preserveView = false) {
      const savedView = preserveView ? { center: map.getCenter(), zoom: map.getZoom() } : null;
      closePinEditor();
      markers.forEach(marker => marker.remove());
      markers = [];
      const grouped = new Map();
      visibleRows().forEach(row => {
        const point = jobCoordinate(row);
        if (!point) return;
        const key = locationGroupKey(point);
        if (!grouped.has(key)) grouped.set(key, { point, rows: [], jobsById: new Map(), sensorCount: 0 });
        const group = grouped.get(key);
        group.rows.push(row);
        if (row.job_id) {
          const existing = group.jobsById.get(String(row.job_id));
          if (!existing || (Number(row.job_sensors) || 0) > (Number(existing.job_sensors) || 0)) group.jobsById.set(String(row.job_id), row);
        }
      });
      grouped.forEach(group => {
        const points = group.rows.map(row => jobCoordinate(row));
        group.point = [
          points.reduce((sum, point) => sum + point[0], 0) / points.length,
          points.reduce((sum, point) => sum + point[1], 0) / points.length,
        ];
        group.sensorCount = locationSensorCount(group);
        group.popupPage = 0;
        const marker = global.L.circleMarker(group.point, {
          radius: Math.max(7, Math.min(19, 7 + Math.sqrt(Math.max(1, group.sensorCount)) / 2)),
          color: '#d8782f', fillColor: '#f0a04b', fillOpacity: 0.86, weight: 2,
        }).addTo(map).bindPopup(buildJobPopup(group)).bindTooltip(`${group.sensorCount} sensors`, { className: 'map-sensor-tooltip', direction: 'top', offset: [0, -8] });
        const bindPopupControls = () => {
          const popupRoot = marker.getPopup()?.getElement();
          if (popupRoot && global.L.DomEvent?.disableClickPropagation) global.L.DomEvent.disableClickPropagation(popupRoot);
          popupRoot?.querySelectorAll('[data-map-page]').forEach(button => {
            if (button.dataset.mapBound === 'true') return;
            button.dataset.mapBound = 'true';
            button.addEventListener('click', event => {
              event.preventDefault();
              event.stopPropagation();
              global.L.DomEvent?.stopPropagation(event);
              group.popupPage = Number(button.dataset.mapPage) || 0;
              const currentSection = marker.getPopup()?.getElement()?.querySelector('.map-job-ap-section');
              if (!currentSection) return;
              const replacement = document.createElement('div');
              replacement.innerHTML = buildJobApSection(group, group.popupPage);
              currentSection.replaceWith(replacement.firstElementChild);
              bindPopupControls();
            });
          });
          popupRoot?.querySelectorAll('[data-map-move-ap]').forEach(button => {
            if (button.dataset.mapBound === 'true') return;
            button.dataset.mapBound = 'true';
            button.addEventListener('click', () => {
              const encodedKey = button.getAttribute('data-map-move-ap') || '';
              const row = group.rows.find(candidate => encodeURIComponent(rowKey(candidate)) === encodedKey);
              if (row) {
                marker.closePopup();
                beginApPinEdit(row);
              }
            });
          });
          popupRoot?.querySelectorAll('[data-map-move-job]').forEach(button => {
            if (button.dataset.mapBound === 'true') return;
            button.dataset.mapBound = 'true';
            button.addEventListener('click', () => {
              const jobId = button.getAttribute('data-map-move-job') || '';
              const row = group.rows.find(candidate => String(candidate.job_id) === jobId && candidate.location_kind === 'job_site');
              if (row) {
                marker.closePopup();
                beginJobPinEdit(row);
              }
            });
          });
          popupRoot?.querySelectorAll('[data-map-move-location]').forEach(button => {
            if (button.dataset.mapBound === 'true') return;
            button.dataset.mapBound = 'true';
            button.addEventListener('click', () => {
              const value = button.getAttribute('data-map-move-location') || '';
              const row = value.startsWith('id:')
                ? group.rows.find(candidate => String(candidate.job_location_id) === value.slice(3))
                : group.rows.find(candidate => addressRowKey(candidate) === decodeURIComponent(value.replace(/^key:/, '')));
              if (row) {
                marker.closePopup();
                beginMappedLocationEdit(row);
              }
            });
          });
          popupRoot?.querySelectorAll('[data-map-delete-location]').forEach(button => {
            if (button.dataset.mapBound === 'true') return;
            button.dataset.mapBound = 'true';
            button.addEventListener('click', () => {
              const row = group.rows.find(candidate => String(candidate.job_location_id) === button.getAttribute('data-map-delete-location'));
              if (row) {
                marker.closePopup();
                deleteJobLocation(row);
              }
            });
          });
          const moveAll = popupRoot?.querySelector('[data-map-move-all]');
          if (moveAll && moveAll.dataset.mapBound !== 'true') {
            moveAll.dataset.mapBound = 'true';
            moveAll.addEventListener('click', () => {
              marker.closePopup();
              beginApPinEdit(group.rows.filter(row => row.location_kind === 'sensor_location' && row.access_point));
            });
          }
        };
        marker.on('popupopen', bindPopupControls);
        markers.push(marker);
      });
      if (savedView) {
        map.setView(savedView.center, savedView.zoom, { animate: false });
      } else if (grouped.size) {
        const bounds = global.L.latLngBounds([...grouped.values()].map(group => group.point));
        map.fitBounds(bounds.pad(0.18), { maxZoom: 15 });
      } else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      renderList();
    }
    async function refresh() {
      if (refreshButton) refreshButton.disabled = true;
      setStatus('Loading job locations…');
      try {
        const headers = typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {};
        const response = await fetch(options.dataUrl, { headers });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        rows = jobRows(await response.json());
        renderMarkers();
        const counts = mapCounts();
        if (geocodeButton) geocodeButton.hidden = counts.distinctAddressOnly === 0;
        setStatus(`${counts.jobs} jobs · ${counts.physicalLocations} distinct locations · ${counts.distinctAddressOnly} addresses awaiting geocode`);
      } catch (error) {
        setStatus(`Map could not load: ${error.message}`);
      } finally {
        if (refreshButton) refreshButton.disabled = false;
      }
    }
    async function geocodeMissing() {
      const targets = geocodeTargetRows(visibleRows());
      const unique = [...new Map(targets.map(row => [cacheKey(row.address), row.address])).entries()];
      if (!unique.length) return;
      if (geocodeButton) geocodeButton.disabled = true;
      let resolved = 0;
      let failed = 0;
      let persisted = 0;
      let persistError = '';
      setStatus(`Resolving ${unique.length} distinct address${unique.length === 1 ? '' : 'es'}…`);
      const batch = unique.slice(0, 40);
      for (const [key, address] of batch) {
        try {
          const result = await geocode(address);
          if (result) {
            rows.filter(row => cacheKey(row.address) === key).forEach(row => {
              row._mapLatitude = result.latitude;
              row._mapLongitude = result.longitude;
              row._mapFromAddress = true;
            });
            resolved += 1;
          }
          else failed += 1;
        } catch (_) {
          failed += 1;
        }
        setStatus(`Mapped ${resolved} of ${batch.length} distinct addresses…`);
        await wait(GEOCODE_DELAY_MS);
      }
      const saveRows = rows.filter(row => row._mapFromAddress
        && ['job_site', 'job_location', 'legacy_offsite'].includes(row.location_kind)
        && row.job_id
        && row.address);
      const uniqueSaveRows = [...new Map(saveRows.map(row => [
        `${row.job_id}|${row.job_location_id || row.location_kind}|${cacheKey(row.address)}`,
        row,
      ])).values()];
      if (uniqueSaveRows.length) {
        try {
          const headers = {
            ...(typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {}),
            'Content-Type': 'application/json',
          };
          const response = await fetch(`${CONFIG.WORKER_URL}/job-locations/batch`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ locations: uniqueSaveRows.map(row => ({
              id: row.job_location_id || null,
              job_info_id: row.job_id,
              location_role: row.location_role === 'main_site' ? 'main_site' : 'offsite',
              name: row.name || (row.location_role === 'main_site' ? 'Main site' : 'Offsite'),
              address: row.address,
              latitude: row._mapLatitude,
              longitude: row._mapLongitude,
              location_source: 'address_geocode',
              notes: row.location_kind === 'legacy_offsite' ? row.notes : row.notes || null,
            })) }),
          });
          if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
          persisted = uniqueSaveRows.length;
        } catch (error) {
          persistError = ` Coordinates were mapped for this view but could not be saved (${error.message}).`;
        }
      }
      renderMarkers();
      const remaining = uniqueAddressRows(geocodeTargetRows(visibleRows())).length;
      const failureNote = failed && !resolved ? ` No addresses were resolved; check the browser network requests to the geocoding providers.` : '';
      const savedNote = persisted ? ` · ${persisted} saved to D1` : '';
      setStatus(`${resolved} distinct address${resolved === 1 ? '' : 'es'} mapped${savedNote}${remaining ? ` · ${remaining} still need review` : ''}${failureNote}${persistError}`);
      if (geocodeButton) { geocodeButton.hidden = remaining === 0; geocodeButton.disabled = false; }
    }
    searchInput?.addEventListener('input', () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      renderMarkers();
      const counts = mapCounts(visibleRows());
      if (geocodeButton) geocodeButton.hidden = counts.distinctAddressOnly === 0;
      setStatus(searchTerm
        ? `${counts.jobs} matching jobs · ${counts.physicalLocations} locations`
        : `${counts.jobs} jobs · ${counts.physicalLocations} distinct locations · ${counts.distinctAddressOnly} addresses awaiting geocode`);
    });
    refreshButton?.addEventListener('click', refresh);
    geocodeButton?.addEventListener('click', geocodeMissing);
    refresh();
    window.setTimeout(() => map.invalidateSize(), 0);
    return { map, refresh };
  }

  function mount(options) {
    const container = typeof options.container === 'string' ? document.getElementById(options.container) : options.container;
    if (!container) return null;
    if (!global.L) {
      container.innerHTML = '<div class="map-empty">Map library could not be loaded.</div>';
      return null;
    }

    const status = options.status ? document.getElementById(options.status) : null;
    const list = options.list ? document.getElementById(options.list) : null;
    const refreshButton = options.refresh ? document.getElementById(options.refresh) : null;
    const geocodeButton = options.geocode ? document.getElementById(options.geocode) : null;
    const map = global.L.map(container, { scrollWheelZoom: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    global.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    let rows = [];
    let markers = [];
    let editState = null;
    let locationEditState = null;
    let locationRecords = [];
    let refreshPromise = null;

    function setStatus(message) { if (status) status.textContent = message; }

    function closePinEditor() {
      if (!editState) return;
      editState.marker.remove();
      editState.editor.remove();
      editState = null;
    }

    function closeLocationEditor() {
      if (!locationEditState) return;
      locationEditState.editor.remove();
      locationEditState = null;
    }

    function locationFormValue(editor, field) {
      return editor.querySelector(`[data-location-field="${field}"]`)?.value.trim() || '';
    }

    function fillLocationForm(editor, location = {}) {
      ['name', 'address', 'access_hours', 'contact_name', 'contact_phone', 'contact_email', 'notes'].forEach(field => {
        const input = editor.querySelector(`[data-location-field="${field}"]`);
        if (input) input.value = location[field] || '';
      });
    }

    async function saveLocationDetails() {
      if (!locationEditState) return;
      const { rows: linkedRows, editor } = locationEditState;
      const name = locationFormValue(editor, 'name');
      if (!name) {
        setStatus('A shared location name is required.');
        return;
      }
      const selectedId = Number(editor.querySelector('[data-location-select]')?.value) || null;
      const saveButton = editor.querySelector('[data-location-save]');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
      try {
        const locationPayload = {
          ...(selectedId ? { id: selectedId } : {}),
          name,
          address: locationFormValue(editor, 'address'),
          access_hours: locationFormValue(editor, 'access_hours'),
          contact_name: locationFormValue(editor, 'contact_name'),
          contact_phone: locationFormValue(editor, 'contact_phone'),
          contact_email: locationFormValue(editor, 'contact_email'),
          notes: locationFormValue(editor, 'notes'),
          location_source: 'manual',
        };
        const locationResponse = await fetch(`${CONFIG.WORKER_URL}/physical-locations`, {
          method: 'POST',
          headers: { ...(typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {}), 'Content-Type': 'application/json' },
          body: JSON.stringify(locationPayload),
        });
        if (!locationResponse.ok) throw new Error(`${locationResponse.status} ${await locationResponse.text()}`);
        const savedLocation = await locationResponse.json();
        const locationId = Number(savedLocation.id);
        const assignResponse = await fetch(`${CONFIG.WORKER_URL}/physical-locations/assign`, {
          method: 'POST',
          headers: { ...(typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {}), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location_id: locationId,
            locations: linkedRows.map(row => ({
              server: row.server,
              access_point: row.access_point,
              address: locationPayload.address || row.address || '',
              floor: row.floor || '',
              room: row.room || '',
              notes: row.notes || '',
              latitude: row.latitude ?? row._mapLatitude ?? null,
              longitude: row.longitude ?? row._mapLongitude ?? null,
              location_accuracy_m: row.location_accuracy_m ?? null,
              location_captured_at: row.location_captured_at || null,
              location_source: row.ap_location_source || 'manual',
            })),
          }),
        });
        if (!assignResponse.ok) throw new Error(`${assignResponse.status} ${await assignResponse.text()}`);
        const updatedLocation = { ...locationPayload, id: locationId };
        locationRecords = [...locationRecords.filter(location => Number(location.id) !== locationId), updatedLocation];
        linkedRows.forEach(row => {
          row.location_id = locationId;
          row.location_name = name;
          row.location_address = locationPayload.address;
          row.location_notes = locationPayload.notes;
          row.access_hours = locationPayload.access_hours;
          row.contact_name = locationPayload.contact_name;
          row.contact_phone = locationPayload.contact_phone;
          row.contact_email = locationPayload.contact_email;
          if (locationPayload.address) row.address = locationPayload.address;
          row.location_saved = true;
        });
        closeLocationEditor();
        renderMarkers(true);
        setStatus(`Saved shared location for ${linkedRows.length} AP${linkedRows.length === 1 ? '' : 's'}`);
      } catch (error) {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save location'; }
        setStatus(`Location could not be saved: ${error.message}`);
      }
    }

    function beginLocationEdit(rowsToLink, locationId = null) {
      const linkedRows = Array.isArray(rowsToLink) ? rowsToLink : [rowsToLink];
      closePinEditor();
      closeLocationEditor();
      const existing = locationRecords.find(location => Number(location.id) === Number(locationId)) || {};
      const optionsHtml = `<option value="">Create new shared location</option>${locationRecords.map(location =>
        `<option value="${escapeHtml(location.id)}"${Number(location.id) === Number(locationId) ? ' selected' : ''}>${escapeHtml(location.name)}</option>`).join('')}`;
      const editor = document.createElement('div');
      editor.className = 'map-location-editor';
      editor.innerHTML = `<strong>Shared location details</strong>
        <span>${linkedRows.length} AP${linkedRows.length === 1 ? '' : 's'} will share these notes.</span>
        <label>Use existing location<select data-location-select>${optionsHtml}</select></label>
        <label>Name<input data-location-field="name" type="text" placeholder="Building or campus name"></label>
        <label>Address<input data-location-field="address" type="text" placeholder="Address"></label>
        <label>Access hours<input data-location-field="access_hours" type="text" placeholder="Example: Mon–Fri 7 AM–5 PM"></label>
        <label>Contact name<input data-location-field="contact_name" type="text"></label>
        <label>Contact phone<input data-location-field="contact_phone" type="text"></label>
        <label>Contact email<input data-location-field="contact_email" type="email"></label>
        <label>Notes<textarea data-location-field="notes" rows="3" placeholder="Entry, escort, closure, or access instructions"></textarea></label>
        <div><button type="button" data-location-cancel>Cancel</button><button type="button" class="primary" data-location-save>Save location</button></div>`;
      container.appendChild(editor);
      locationEditState = { rows: linkedRows, editor };
      fillLocationForm(editor, existing);
      editor.querySelector('[data-location-select]')?.addEventListener('change', event => {
        const selected = locationRecords.find(location => Number(location.id) === Number(event.target.value));
        fillLocationForm(editor, selected || {});
      });
      editor.querySelector('[data-location-cancel]')?.addEventListener('click', closeLocationEditor);
      editor.querySelector('[data-location-save]')?.addEventListener('click', saveLocationDetails);
      setStatus(`Editing shared location for ${linkedRows.length} AP${linkedRows.length === 1 ? '' : 's'}`);
    }

    async function savePin() {
      if (!editState) return;
      const { rows: editRows, marker, editor, onSaved } = editState;
      const point = marker.getLatLng();
      const saveButton = editor.querySelector('[data-map-pin-save]');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
      try {
        const capturedAt = new Date().toISOString();
        const response = await fetch(`${CONFIG.WORKER_URL}/ap-locations/batch`, {
          method: 'POST',
          headers: { ...(typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {}), 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: editRows.map(row => ({
            server: row.server,
            access_point: row.access_point,
            address: row.address || '',
            floor: row.floor || '',
            room: row.room || '',
            notes: row.notes || '',
            latitude: point.lat,
            longitude: point.lng,
            location_accuracy_m: null,
            location_captured_at: capturedAt,
            location_source: 'manual',
          })) }),
        });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        editRows.forEach(row => {
          row.latitude = point.lat;
          row.longitude = point.lng;
          row.location_accuracy_m = null;
          row.location_captured_at = capturedAt;
          row.location_source = 'manual';
          row.location_saved = true;
          row.coordinates_saved = true;
          row._mapLatitude = point.lat;
          row._mapLongitude = point.lng;
          row._mapFromAddress = false;
        });
        closePinEditor();
        renderMarkers(true);
        setStatus(`Saved manual pin for ${editRows.length} AP${editRows.length === 1 ? '' : 's'}`);
        if (typeof onSaved === 'function') await onSaved(point);
      } catch (error) {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save pin'; }
        setStatus(`Pin could not be saved: ${error.message}`);
      }
    }

    function beginPinEdit(rowsToMove, { initialPoint = null, mode = 'move', onSaved = null } = {}) {
      const editRows = Array.isArray(rowsToMove) ? rowsToMove : [rowsToMove];
      const point = validPoint(initialPoint) || coordinate(editRows[0]);
      if (!point) {
        setStatus('Map the saved address first, then move its pin.');
        return;
      }
      closePinEditor();
      const marker = global.L.marker(point, { draggable: true, autoPan: true }).addTo(map);
      const editor = document.createElement('div');
      editor.className = 'map-pin-editor';
      const summary = groupSummary(editRows);
      editor.innerHTML = `<strong>Move ${editRows.length} AP${editRows.length === 1 ? '' : 's'} · ${summary.sensorCount} sensors</strong>
        <span data-map-pin-coordinates>Drag the pin to the actual location.</span>
        <div><button type="button" data-map-pin-cancel>Cancel</button><button type="button" class="primary" data-map-pin-save>Save pin</button></div>`;
      container.appendChild(editor);
      editState = { rows: editRows, marker, editor };
      const coordinates = editor.querySelector('[data-map-pin-coordinates]');
      marker.on('drag', event => {
        const current = event.target.getLatLng();
        coordinates.textContent = `${current.lat.toFixed(6)}, ${current.lng.toFixed(6)}`;
      });
      editor.querySelector('[data-map-pin-cancel]')?.addEventListener('click', closePinEditor);
      editor.querySelector('[data-map-pin-save]')?.addEventListener('click', savePin);
      if (mode === 'pick') {
        editor.querySelector('strong').textContent = `Pick ${editRows.length} AP${editRows.length === 1 ? '' : 's'} - ${summary.sensorCount} sensors`;
        editor.querySelector('[data-map-pin-coordinates]').textContent = 'Drag the pin to the precise AP location, then save.';
      }
      editState.onSaved = onSaved;
      marker.bindTooltip('Drag to move this AP pin', { permanent: true, direction: 'top', offset: [0, -8] }).openTooltip();
      setStatus(`Moving ${editRows.length} AP${editRows.length === 1 ? '' : 's'} at one location`);
    }

    async function pickApLocation({ server, accessPoint, initialPoint = null, fallbackAddress = '', preferFallback = false, onSaved = null } = {}) {
      if (refreshPromise) await refreshPromise;
      else if (!rows.length) await refresh();
      const target = rows.find(row => String(row.server) === String(server)
        && String(row.access_point) === String(accessPoint));
      if (!target) {
        setStatus(`AP ${accessPoint || ''} could not be found on the map.`.trim());
        return;
      }

      let point = validPoint(initialPoint) || (preferFallback ? null : coordinate(target));
      if (!point && String(fallbackAddress || '').trim()) {
        setStatus('Finding the main site address on the mapâ€¦');
        try {
          const result = await geocode(fallbackAddress);
          point = validPoint([result.latitude, result.longitude]);
        } catch (_) {
          // Fall back to the map's current view if geocoding is unavailable.
        }
      }
      point ||= coordinate(target) || validPoint(map.getCenter()) || DEFAULT_CENTER;
      map.setView(point, Math.max(map.getZoom(), initialPoint ? 16 : 14), { animate: false });
      beginPinEdit(target, { initialPoint: point, mode: 'pick', onSaved });
    }

    function renderList() {
      if (!list) return;
      const mapped = rows.filter(row => coordinate(row));
      const missing = rows.filter(row => !coordinate(row) && String(row.address || '').trim());
      const noAddress = rows.filter(row => !coordinate(row) && !String(row.address || '').trim());
      const unmapped = rows.filter(row => !coordinate(row));
      const saved = rows.filter(hasSavedLocation);
      list.innerHTML = `<div class="map-summary">
        <span><strong>${rows.length}</strong> AP groups</span>
        <span><strong>${saved.length}</strong> saved locations</span>
        <span><strong>${mapped.length}</strong> mapped</span>
        <span><strong>${missing.length}</strong> address-only</span>
        ${noAddress.length ? `<span><strong>${noAddress.length}</strong> missing address</span>` : ''}
        <span><strong>${unmapped.length}</strong> still needing a location</span>
      </div>${unmapped.length ? `<div class="map-unmapped-list"><strong>APs still needing a location</strong>${unmapped.map(row => {
        const accessPoint = String(row.access_point || '').trim();
        const editable = accessPoint && !/^no access point$/i.test(accessPoint);
        return `<div class="map-unmapped-row">
          <div class="map-unmapped-main">
            <strong>${escapeHtml(row.server)} · ${escapeHtml(accessPoint || 'No access point')}</strong>
            <span>${escapeHtml(String(row.address || '').trim() || 'No address entered')}</span>
            <span class="map-unmapped-meta">${Number(row.sensor_count) || 0} sensors · ${Number(row.remaining) || 0} remaining</span>
          </div>
          ${editable
            ? `<button type="button" data-map-edit-ap="${escapeHtml(encodeURIComponent(rowKey(row)))}">Edit AP location</button>`
            : '<span class="map-unmapped-meta">No AP data</span>'}
        </div>`;
      }).join('')}</div>` : '<div class="map-unmapped-list"><strong>All AP groups have saved map locations.</strong></div>'}`;
      list.querySelectorAll('[data-map-edit-ap]').forEach(button => {
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const encodedKey = button.getAttribute('data-map-edit-ap') || '';
          const row = rows.find(candidate => encodeURIComponent(rowKey(candidate)) === encodedKey);
          if (row && typeof options.onEditAp === 'function') options.onEditAp(row);
        });
      });
    }

    function renderMarkers(preserveView = false) {
      const savedView = preserveView ? { center: map.getCenter(), zoom: map.getZoom() } : null;
      closePinEditor();
      closeLocationEditor();
      markers.forEach(marker => marker.remove());
      markers = [];
      const grouped = new Map();
      rows.forEach(row => {
        const point = coordinate(row);
        if (!point) return;
        const key = locationGroupKey(point);
        if (!grouped.has(key)) grouped.set(key, { point, rows: [] });
        grouped.get(key).rows.push(row);
      });

      grouped.forEach(group => {
        const points = group.rows.map(row => coordinate(row));
        group.point = [
          points.reduce((sum, point) => sum + point[0], 0) / points.length,
          points.reduce((sum, point) => sum + point[1], 0) / points.length,
        ];
        const { sensorCount: totalSensors, remaining: totalRemaining, calibrated: totalCalibrated } = groupSummary(group.rows);
        const representative = { ...group.rows[0], sensor_count: totalSensors, remaining: totalRemaining, calibrated_count: totalCalibrated };
        const locationIds = [...new Set(group.rows.map(row => Number(row.location_id)).filter(id => Number.isInteger(id) && id > 0))];
        const sharedLocationId = locationIds.length === 1 && group.rows.every(row => Number(row.location_id) === locationIds[0])
          ? locationIds[0]
          : null;
        const groupAdjust = group.rows.length > 1
          ? `<button type="button" class="map-pin-adjust" data-map-adjust-group="true">Move all ${group.rows.length} APs together</button>`
          : '';
        const groupLocationAction = `<button type="button" class="map-location-edit" data-map-location-group="true">${sharedLocationId ? 'Edit location details' : 'Create location details'}</button>`;
        const sharedLocationDetails = sharedLocationId ? locationDetailsHtml(group.rows[0]) : '';
        const rowsByJob = new Map();
        group.rows.forEach(row => {
          const name = String(row.job_name || row.server_customer || options.jobName || '').trim() || 'Unassigned job';
          if (!rowsByJob.has(name)) rowsByJob.set(name, []);
          rowsByJob.get(name).push(row);
        });
        const jobNames = [...rowsByJob.keys()];
        const groupJobName = jobNames.length === 1 ? jobNames[0] : '';
        const jobSections = [...rowsByJob.entries()].map(([jobName, rowsForJob]) =>
          `<div class="map-job-section">${jobNames.length > 1 ? `<strong class="map-job-name">${escapeHtml(jobName)}</strong>` : ''}${rowsForJob.map(row => buildPopup(row, 1, '', false)).join('<hr>')}</div>`
        ).join('');
        const popup = `<div class="map-location-summary">${groupJobName ? `<strong class="map-job-name">${escapeHtml(groupJobName)}</strong>` : jobNames.length > 1 ? `<strong class="map-job-name">${jobNames.length} jobs at this location</strong>` : ''}${sharedLocationId && group.rows[0].location_name ? `<strong class="map-location-name">${escapeHtml(group.rows[0].location_name)}</strong>` : ''}${sharedLocationDetails}<strong>${totalSensors} sensors at this location</strong><span>${group.rows.length} AP${group.rows.length === 1 ? '' : 's'} · ${totalCalibrated} calibrated · ${totalRemaining} remaining</span><div class="map-location-actions">${groupLocationAction}${groupAdjust}</div></div>${jobSections}`;
         let popupPage = 0;
         const marker = global.L.circleMarker(group.point, {
          radius: Math.max(7, Math.min(18, 6 + Math.sqrt(totalSensors))),
          color: markerColor(representative), fillColor: markerColor(representative), fillOpacity: 0.82, weight: 2,
          }).addTo(map).bindPopup(buildDashboardPopup(group, popupPage, options)).bindTooltip(`${totalSensors} sensors`, { className: 'map-sensor-tooltip', direction: 'top', offset: [0, -8] });
         const bindPopupControls = () => {
          const popupRoot = marker.getPopup()?.getElement();
           if (popupRoot && global.L.DomEvent?.disableClickPropagation) global.L.DomEvent.disableClickPropagation(popupRoot);
           popupRoot?.querySelectorAll('[data-map-page]').forEach(button => {
             if (button.dataset.mapBound === 'true') return;
             button.dataset.mapBound = 'true';
              button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                global.L.DomEvent?.stopPropagation(event);
               popupPage = Number(button.getAttribute('data-map-page')) || 0;
                const currentPage = marker.getPopup()?.getElement()?.querySelector('[data-map-popup-page]');
                if (!currentPage) return;
                const replacement = document.createElement('div');
                replacement.innerHTML = buildDashboardPopup(group, popupPage, options);
                const nextPage = replacement.querySelector('[data-map-popup-page]');
                if (nextPage) currentPage.replaceWith(nextPage);
               bindPopupControls();
             });
           });
          popupRoot?.querySelectorAll('[data-map-adjust]').forEach(button => {
            if (button.dataset.mapBound === 'true') return;
            button.dataset.mapBound = 'true';
            button.addEventListener('click', () => {
              const encodedKey = button.getAttribute('data-map-adjust') || '';
              const row = group.rows.find(candidate => encodeURIComponent(rowKey(candidate)) === encodedKey);
              if (row) {
                marker.closePopup();
                beginPinEdit(row);
              }
            });
          });
          popupRoot?.querySelectorAll('[data-map-location]').forEach(button => {
            if (button.dataset.mapBound === 'true') return;
            button.dataset.mapBound = 'true';
            button.addEventListener('click', () => {
              const encodedKey = button.getAttribute('data-map-location') || '';
              const row = group.rows.find(candidate => encodeURIComponent(rowKey(candidate)) === encodedKey);
              if (row) {
                marker.closePopup();
                beginLocationEdit(row, row.location_id);
              }
            });
          });
          const groupButton = popupRoot?.querySelector('[data-map-adjust-group]');
          if (groupButton && groupButton.dataset.mapBound !== 'true') {
            groupButton.dataset.mapBound = 'true';
            groupButton.addEventListener('click', () => {
              marker.closePopup();
              beginPinEdit(group.rows);
            });
          }
          const locationButton = popupRoot?.querySelector('[data-map-location-group]');
          if (locationButton && locationButton.dataset.mapBound !== 'true') {
            locationButton.dataset.mapBound = 'true';
            locationButton.addEventListener('click', () => {
              marker.closePopup();
              beginLocationEdit(group.rows, sharedLocationId);
            });
          }
         };
         marker.on('popupopen', bindPopupControls);
        markers.push(marker);
      });

      if (savedView) {
        map.setView(savedView.center, savedView.zoom, { animate: false });
      } else if (grouped.size) {
        const bounds = global.L.latLngBounds([...grouped.values()].map(group => group.point));
        map.fitBounds(bounds.pad(0.18), { maxZoom: 15 });
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
      renderList();
    }

    async function refreshData() {
      if (refreshButton) refreshButton.disabled = true;
      setStatus('Loading AP locations…');
      try {
        const headers = typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {};
        const [response, locationsResponse] = await Promise.all([
          fetch(options.dataUrl, { headers }),
          fetch(`${CONFIG.WORKER_URL}/physical-locations`, { headers }),
        ]);
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        if (locationsResponse.ok) {
          const locationPayload = await locationsResponse.json();
          locationRecords = Array.isArray(locationPayload) ? locationPayload : [];
        }
        const payload = await response.json();
        rows = Array.isArray(payload) ? payload : (payload.rows || []);
        renderMarkers();
        const mapped = rows.filter(row => coordinate(row)).length;
        const missing = rows.filter(row => !coordinate(row) && String(row.address || '').trim()).length;
        if (geocodeButton) geocodeButton.hidden = missing === 0;
        const saved = rows.filter(hasSavedLocation).length;
        setStatus(`${rows.length} AP groups · ${saved} saved locations · ${mapped} mapped${missing ? ` · ${missing} address-only` : ''}`);
      } catch (error) {
        setStatus(`Map could not load: ${error.message}`);
      } finally {
        if (refreshButton) refreshButton.disabled = false;
      }
    }

    async function refresh() {
      if (refreshPromise) return refreshPromise;
      const operation = refreshData();
      refreshPromise = operation;
      try {
        return await operation;
      } finally {
        if (refreshPromise === operation) refreshPromise = null;
      }
    }

    async function geocodeMissing() {
      const targets = rows.filter(row => !coordinate(row) && String(row.address || '').trim());
      if (!targets.length) return;
      if (geocodeButton) geocodeButton.disabled = true;
      let resolved = 0;
      const unique = [...new Map(targets.map(row => [cacheKey(row.address), row.address])).entries()];
      setStatus(`Resolving ${unique.length} saved address${unique.length === 1 ? '' : 'es'}…`);
      for (const [key, address] of unique.slice(0, 40)) {
        try {
          const result = await geocode(address);
          if (result) {
            rows.filter(row => cacheKey(row.address) === key).forEach(row => {
              row._mapLatitude = result.latitude;
              row._mapLongitude = result.longitude;
              row._mapFromAddress = true;
            });
            resolved += 1;
          }
        } catch (_) { /* keep the address in the unmapped list */ }
        await wait(GEOCODE_DELAY_MS);
      }
      renderMarkers();
      const remaining = rows.filter(row => !coordinate(row) && String(row.address || '').trim()).length;
      setStatus(`${resolved} address${resolved === 1 ? '' : 'es'} mapped for this view${remaining ? ` · ${remaining} still need review` : ''}`);
      if (geocodeButton) geocodeButton.hidden = remaining === 0;
      geocodeButton?.removeAttribute('disabled');
    }

    refreshButton?.addEventListener('click', refresh);
    geocodeButton?.addEventListener('click', geocodeMissing);
    refresh();
    window.setTimeout(() => map.invalidateSize(), 0);
    return { map, refresh, pickApLocation };
  }

  global.IsensixMap = { mount, mountJobs };
})(window);
