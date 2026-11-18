/** Shared Leaflet map view for AP sensor locations. */
(function (global) {
  'use strict';

  const DEFAULT_CENTER = [39.5, -98.35];
  const DEFAULT_ZOOM = 4;
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

  function buildPopup(row, groupedCount = 1) {
    const location = [row.address, row.floor && `Floor ${row.floor}`, row.room && `Room ${row.room}`]
      .filter(Boolean).join(' · ');
    const source = row._mapFromAddress ? 'Address geocoded for this view' : 'GPS coordinates captured';
    return `<strong>${escapeHtml(row.access_point)}</strong><br>
      SID ${escapeHtml(row.server)} · ${Number(row.sensor_count) || 0} sensors<br>
      ${Number(row.calibrated_count) || 0} calibrated · ${Number(row.remaining) || 0} remaining<br>
      ${location ? `${escapeHtml(location)}<br>` : ''}
      <small>${escapeHtml(source)}${groupedCount > 1 ? ` · ${groupedCount} APs at this point` : ''}</small>`;
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

    function setStatus(message) { if (status) status.textContent = message; }

    function renderList() {
      if (!list) return;
      const mapped = rows.filter(row => coordinate(row));
      const missing = rows.filter(row => !coordinate(row) && String(row.address || '').trim());
      const noAddress = rows.filter(row => !coordinate(row) && !String(row.address || '').trim());
      list.innerHTML = `<div class="map-summary">
        <span><strong>${rows.length}</strong> AP locations</span>
        <span><strong>${mapped.length}</strong> mapped</span>
        <span><strong>${missing.length}</strong> address-only</span>
        ${noAddress.length ? `<span><strong>${noAddress.length}</strong> missing address</span>` : ''}
      </div>${missing.length ? `<div class="map-unmapped-list"><strong>Address-only locations</strong>${missing.slice(0, 80).map(row =>
        `<span>${escapeHtml(row.server)} · ${escapeHtml(row.access_point)} — ${escapeHtml(row.address)}</span>`).join('')}</div>` : ''}`;
    }

    function renderMarkers() {
      markers.forEach(marker => marker.remove());
      markers = [];
      const grouped = new Map();
      rows.forEach(row => {
        const point = coordinate(row);
        if (!point) return;
        const key = point.map(value => value.toFixed(5)).join(',');
        if (!grouped.has(key)) grouped.set(key, { point, rows: [] });
        grouped.get(key).rows.push(row);
      });

      grouped.forEach(group => {
        const totalSensors = group.rows.reduce((sum, row) => sum + (Number(row.sensor_count) || 0), 0);
        const totalRemaining = group.rows.reduce((sum, row) => sum + (Number(row.remaining) || 0), 0);
        const totalCalibrated = group.rows.reduce((sum, row) => sum + (Number(row.calibrated_count) || 0), 0);
        const representative = { ...group.rows[0], sensor_count: totalSensors, remaining: totalRemaining, calibrated_count: totalCalibrated };
        const popup = group.rows.map(row => buildPopup(row, group.rows.length)).join('<hr>');
        const marker = global.L.circleMarker(group.point, {
          radius: Math.max(7, Math.min(18, 6 + Math.sqrt(totalSensors))),
          color: markerColor(representative), fillColor: markerColor(representative), fillOpacity: 0.82, weight: 2,
        }).addTo(map).bindPopup(popup);
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
        setStatus(`${rows.length} AP locations · ${mapped} mapped${missing ? ` · ${missing} address-only` : ''}`);
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
