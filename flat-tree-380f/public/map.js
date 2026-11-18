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

  function markerColor(row) {
    if (Number(row.remaining) === 0 && Number(row.sensor_count) > 0) return '#2f9e44';
    if (Number(row.calibrated_count) > 0 || Number(row.exception_count) > 0) return '#287fd1';
    return '#7da7d9';
  }

  function cacheKey(address) { return String(address || '').trim().toLowerCase(); }

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

  async function geocode(address) {
    const key = cacheKey(address);
    if (!key) return null;
    if (geocodeCache[key]) return geocodeCache[key];
    const response = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(address)}`);
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const payload = await response.json();
    const coordinates = payload?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const result = { latitude: Number(coordinates[1]), longitude: Number(coordinates[0]) };
    if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;
    geocodeCache[key] = result;
    saveGeocodeCache();
    return result;
  }

  function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function buildPopup(row, groupedCount = 1, fallbackJobName = '', includeJobName = true) {
    const location = [row.address, row.floor && `Floor ${row.floor}`, row.room && `Room ${row.room}`]
      .filter(Boolean).join(' · ');
    const jobName = String(row.job_name || row.server_customer || fallbackJobName || '').trim();
    const source = row._mapFromAddress
      ? 'Address geocoded for this view'
      : row.location_source === 'manual'
        ? 'Manually adjusted pin'
        : row.location_source === 'gps'
          ? 'GPS coordinates captured'
          : 'Saved coordinates';
    const adjustKey = encodeURIComponent(rowKey(row));
    return `${includeJobName && jobName ? `<div class="map-job-name">${escapeHtml(jobName)}</div>` : ''}<strong>${escapeHtml(row.access_point)}</strong><br>
      ${serverLinkHtml(row.server, row.server_hostname)} · ${Number(row.sensor_count) || 0} sensors<br>
      ${Number(row.calibrated_count) || 0} calibrated · ${Number(row.remaining) || 0} remaining<br>
      ${location ? `${escapeHtml(location)}<br>` : ''}
      <small>${escapeHtml(source)}${groupedCount > 1 ? ` · ${groupedCount} APs at this point` : ''}</small><br>
      <button type="button" class="map-pin-adjust" data-map-adjust="${escapeHtml(adjustKey)}">Adjust pin</button>`;
  }

  function groupSummary(rows) {
    const sensorCount = rows.reduce((sum, row) => sum + (Number(row.sensor_count) || 0), 0);
    const remaining = rows.reduce((sum, row) => sum + (Number(row.remaining) || 0), 0);
    const calibrated = rows.reduce((sum, row) => sum + (Number(row.calibrated_count) || 0), 0);
    return { sensorCount, remaining, calibrated };
  }

  function locationGroupKey(point) {
    const [latitude, longitude] = point;
    const latitudeStep = LOCATION_GROUP_METERS / 111320;
    const longitudeStep = LOCATION_GROUP_METERS / (111320 * Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
    return `${Math.round(latitude / latitudeStep)}:${Math.round(longitude / longitudeStep)}`;
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

    function setStatus(message) { if (status) status.textContent = message; }

    function closePinEditor() {
      if (!editState) return;
      editState.marker.remove();
      editState.editor.remove();
      editState = null;
    }

    async function savePin() {
      if (!editState) return;
      const { rows: editRows, marker, editor } = editState;
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
        renderMarkers();
        setStatus(`Saved manual pin for ${editRows.length} AP${editRows.length === 1 ? '' : 's'}`);
      } catch (error) {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save pin'; }
        setStatus(`Pin could not be saved: ${error.message}`);
      }
    }

    function beginPinEdit(rowsToMove) {
      const editRows = Array.isArray(rowsToMove) ? rowsToMove : [rowsToMove];
      const point = coordinate(editRows[0]);
      if (!point) {
        setStatus('Map the saved address first, then adjust its pin.');
        return;
      }
      closePinEditor();
      const marker = global.L.marker(point, { draggable: true, autoPan: true }).addTo(map);
      const editor = document.createElement('div');
      editor.className = 'map-pin-editor';
      const summary = groupSummary(editRows);
      editor.innerHTML = `<strong>Adjust ${editRows.length} AP${editRows.length === 1 ? '' : 's'} · ${summary.sensorCount} sensors</strong>
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
      marker.bindTooltip('Drag to adjust this AP pin', { permanent: true, direction: 'top', offset: [0, -8] }).openTooltip();
      setStatus(`Adjusting ${editRows.length} AP${editRows.length === 1 ? '' : 's'} at one location`);
    }

    function renderList() {
      if (!list) return;
      const mapped = rows.filter(row => coordinate(row));
      const missing = rows.filter(row => !coordinate(row) && String(row.address || '').trim());
      const noAddress = rows.filter(row => !coordinate(row) && !String(row.address || '').trim());
      const saved = rows.filter(hasSavedLocation);
      list.innerHTML = `<div class="map-summary">
        <span><strong>${rows.length}</strong> AP groups</span>
        <span><strong>${saved.length}</strong> saved locations</span>
        <span><strong>${mapped.length}</strong> mapped</span>
        <span><strong>${missing.length}</strong> address-only</span>
        ${noAddress.length ? `<span><strong>${noAddress.length}</strong> missing address</span>` : ''}
      </div>${missing.length ? `<div class="map-unmapped-list"><strong>Address-only locations</strong>${missing.slice(0, 80).map(row =>
        `<span>${escapeHtml(row.server)} · ${escapeHtml(row.access_point)} — ${escapeHtml(row.address)}</span>`).join('')}</div>` : ''}`;
    }

    function renderMarkers() {
      closePinEditor();
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
        const groupAdjust = group.rows.length > 1
          ? `<button type="button" class="map-pin-adjust" data-map-adjust-group="true">Adjust all ${group.rows.length} APs together</button>`
          : '';
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
        const popup = `<div class="map-location-summary">${groupJobName ? `<strong class="map-job-name">${escapeHtml(groupJobName)}</strong>` : jobNames.length > 1 ? `<strong class="map-job-name">${jobNames.length} jobs at this location</strong>` : ''}<strong>${totalSensors} sensors at this location</strong><span>${group.rows.length} AP${group.rows.length === 1 ? '' : 's'} · ${totalCalibrated} calibrated · ${totalRemaining} remaining</span>${groupAdjust}</div>${jobSections}`;
        const marker = global.L.circleMarker(group.point, {
          radius: Math.max(7, Math.min(18, 6 + Math.sqrt(totalSensors))),
          color: markerColor(representative), fillColor: markerColor(representative), fillOpacity: 0.82, weight: 2,
        }).addTo(map).bindPopup(popup).bindTooltip(`${totalSensors} sensors`, { className: 'map-sensor-tooltip', direction: 'top', offset: [0, -8] });
        marker.on('popupopen', () => {
          const popupRoot = marker.getPopup()?.getElement();
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
          const groupButton = popupRoot?.querySelector('[data-map-adjust-group]');
          if (groupButton && groupButton.dataset.mapBound !== 'true') {
            groupButton.dataset.mapBound = 'true';
            groupButton.addEventListener('click', () => {
              marker.closePopup();
              beginPinEdit(group.rows);
            });
          }
        });
        markers.push(marker);
      });

      if (grouped.size) {
        const bounds = global.L.latLngBounds([...grouped.values()].map(group => group.point));
        map.fitBounds(bounds.pad(0.18), { maxZoom: 15 });
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
      renderList();
    }

    async function refresh() {
      if (refreshButton) refreshButton.disabled = true;
      setStatus('Loading AP locations…');
      try {
        const response = await fetch(options.dataUrl, { headers: typeof global.siteApiHeaders === 'function' ? global.siteApiHeaders() : {} });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
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
        await wait(350);
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
    return { map, refresh };
  }

  global.IsensixMap = { mount };
})(window);
