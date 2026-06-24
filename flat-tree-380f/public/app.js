/* ─── State ─────────────────────────────────────────────── */
let servers     = JSON.parse(localStorage.getItem('cal_servers') || '[]');
let thresholds  = JSON.parse(localStorage.getItem('cal_thresholds') || 'null')
                  || { ...CONFIG.DEFAULT_THRESHOLDS };
let allSensors  = [];
let currentTab  = 'left';
let sortCol     = null;
let sortDir     = 1;

/* ─── Helpers ───────────────────────────────────────────── */
function saveServers()    { localStorage.setItem('cal_servers', JSON.stringify(servers)); }
function saveThresholds() { localStorage.setItem('cal_thresholds', JSON.stringify(thresholds)); }

function getCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - CONFIG.ROLLING_DAYS);
  return d;
}

function isCalibrated(s) {
  if (!s.calibrated_at) return false;
  return new Date(s.calibrated_at) >= getCutoff();
}

function isFailed(s) {
  if (s.new_offset === null || s.new_offset === undefined) return false;
  const max = thresholds[s.sensor_type];
  if (max === undefined) return false;
  return Math.abs(parseFloat(s.new_offset)) > max;
}

function setStatus(msg) {
  document.getElementById('status-msg').textContent = msg;
}

function fmtDate(iso) {
  if (!iso) return '<span class="muted">—</span>';
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} `
       + `${String(d.getHours()).padStart(2,'0')}:`
       + `${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtOffset(v) {
  if (v === null || v === undefined || v === '') return '—';
  return parseFloat(v).toFixed(2);
}

function badge(t) {
  if (!t) return '';
  const known = ['RE','HU','RM','SC','TC','DP','CO2_A_20', 'TMC Guardian', 'TMC ARMS'];
  const cls = known.includes(t) ? `badge-${t}` : 'badge-other';
  return `<span class="badge ${cls}">${t}</span>`;
}

/* ─── Server tags ───────────────────────────────────────── */
function renderServerTags() {
  const el = document.getElementById('server-tags');
  if (!servers.length) {
    el.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">No servers added yet.</span>';
    return;
  }
  el.innerHTML = servers.map(s => `
    <span class="server-tag">
      <i class="ti ti-server-2" style="font-size:13px;"></i>
      Server ${s}
      <button class="remove-btn" onclick="removeServer('${s}')" aria-label="Remove server ${s}">×</button>
    </span>`).join('');
}

function addServer() {
  const inp = document.getElementById('server-input');
  const val = inp.value.trim().replace(/\D/g, '');
  if (!val || servers.includes(val)) { inp.value = ''; return; }
  servers.push(val);
  saveServers();
  renderServerTags();
  inp.value = '';
  loadData();
}

function removeServer(s) {
  servers = servers.filter(x => x !== s);
  saveServers();
  renderServerTags();
  loadData();
}

/* ─── Settings / thresholds ─────────────────────────────── */
function toggleSettings() {
  const p = document.getElementById('settings-panel');
  const visible = p.style.display === 'block';
  p.style.display = visible ? 'none' : 'block';
  if (!visible) renderThresholdInputs();
}

function renderThresholdInputs() {
  const el = document.getElementById('threshold-inputs');
  el.innerHTML = Object.entries(thresholds).map(([t, v]) => `
    <div class="threshold-row">
      <span class="threshold-type">${t}</span>
      <input type="number" step="0.01" value="${v}" style="width:90px;"
        onchange="thresholds['${t}']=parseFloat(this.value)||0; saveThresholds(); renderTable();" />
      <button class="danger" onclick="deleteThreshold('${t}')">Remove</button>
    </div>`).join('');
}

function addThreshold() {
  const t = document.getElementById('new-type-name').value.trim().toUpperCase();
  const v = parseFloat(document.getElementById('new-type-val').value);
  if (!t || isNaN(v)) return;
  thresholds[t] = v;
  saveThresholds();
  document.getElementById('new-type-name').value = '';
  document.getElementById('new-type-val').value = '';
  renderThresholdInputs();
  renderTable();
}

function deleteThreshold(t) {
  delete thresholds[t];
  saveThresholds();
  renderThresholdInputs();
  renderTable();
}

/* ─── Data loading ──────────────────────────────────────── */
async function loadData() {
  if (!servers.length) {
    allSensors = [];
    renderMetrics();
    showEmpty(true);
    return;
  }
  showEmpty(false);
  setStatus('Loading…');
  try {
    const results = await Promise.all(
      servers.map(s =>
        fetch(`${CONFIG.WORKER_URL}/calibrations?server=${s}`, {
          headers: { 'X-Api-Key': CONFIG.API_KEY }
        }).then(r => r.json())
      )
    );
    allSensors = results.flat();
    setStatus(`${allSensors.length} sensors — ${new Date().toLocaleTimeString()}`);
    populateFilters();
    renderMetrics();
    renderTable();
  } catch (e) {
    setStatus('Error loading data');
    console.error(e);
  }
}

function showEmpty(b) {
  document.getElementById('empty-state').style.display  = b ? 'block' : 'none';
  document.getElementById('main-panel').style.display   = b ? 'none'  : 'block';
  document.getElementById('filter-bar').style.display   = b ? 'none'  : 'flex';
}

/* ─── Metrics ───────────────────────────────────────────── */
function renderMetrics() {
  const total = allSensors.length;
  const cal   = allSensors.filter(isCalibrated).length;
  const left  = total - cal;
  const fail  = allSensors.filter(isFailed).length;
  const pct   = total > 0 ? Math.round((cal / total) * 100) : 0;

  const r = 26, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const track = '#2a2a38';

  document.getElementById('metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Total sensors</div>
      <div class="metric-value">${total}</div>
      <div class="metric-sub">${servers.length} server${servers.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Calibrated (${CONFIG.ROLLING_DAYS}d)</div>
      <div class="metric-value green">${cal}</div>
      <div class="metric-sub">${pct}% complete</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Remaining</div>
      <div class="metric-value orange">${left}</div>
      <div class="metric-sub">not yet calibrated</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Failures</div>
      <div class="metric-value red">${fail}</div>
      <div class="metric-sub">offset exceeded</div>
    </div>
    <div class="metric-card donut-card">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Progress ${pct}%">
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="${track}" stroke-width="7"/>
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="#5a9e2f" stroke-width="7"
          stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
          stroke-linecap="round" transform="rotate(-90 32 32)"/>
        <text x="32" y="37" text-anchor="middle" font-size="12" font-weight="600"
          fill="#e8e8f0">${pct}%</text>
      </svg>
      <div class="donut-legend">
        <div class="metric-label">Progress</div>
        <div class="donut-legend-item"><span class="donut-dot" style="background:#5a9e2f"></span>Done</div>
        <div class="donut-legend-item"><span class="donut-dot" style="background:${track}"></span>Left</div>
      </div>
    </div>`;
}

/* ─── Filters ───────────────────────────────────────────── */
function populateFilters() {
  const types = [...new Set(allSensors.map(s => s.sensor_type).filter(Boolean))].sort();
  const tf = document.getElementById('type-filter');
  const cur = tf.value;
  tf.innerHTML = '<option value="">All types</option>'
    + types.map(t => `<option value="${t}"${t === cur ? ' selected' : ''}>${t}</option>`).join('');

  const sf = document.getElementById('server-filter');
  const scur = sf.value;
  sf.innerHTML = '<option value="">All servers</option>'
    + servers.map(s => `<option value="${s}"${s === scur ? ' selected' : ''}>${s}</option>`).join('');
}

function applyFilters(rows) {
  const tf = document.getElementById('type-filter').value;
  const sf = document.getElementById('server-filter').value;
  const q  = document.getElementById('search-input').value.toLowerCase();
  return rows.filter(s =>
    (!tf || s.sensor_type === tf) &&
    (!sf || s.server === sf) &&
    (!q  || (s.sensor_name || '').toLowerCase().includes(q)
          || (s.zone || '').toLowerCase().includes(q)
          || String(s.sensor_id).includes(q))
  );
}

function applySort(rows) {
  if (!sortCol) return rows;
  return [...rows].sort((a, b) => {
    let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
    const an = parseFloat(av), bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) { av = an; bv = bn; }
    if (av < bv) return -sortDir;
    if (av > bv) return  sortDir;
    return 0;
  });
}

/* ─── Tab switching ─────────────────────────────────────── */
function switchTab(tab) {
  currentTab = tab;
  sortCol = null;
  sortDir = 1;
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  const showFilter = ['left','calibrated','failures','all'].includes(tab);
  document.getElementById('filter-bar').style.display = showFilter ? 'flex' : 'none';
  renderTable();
}

function sortBy(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = 1; }
  renderTable();
}

/* ─── Main table (sensor rows) ──────────────────────────── */
const SENSOR_COLS = [
  { key: 'sensor_id',    label: 'ID',         defaultW: 52  },
  { key: 'sensor_name',  label: 'Sensor name', defaultW: 220 },
  { key: 'zone',         label: 'Zone',        defaultW: 160 },
  { key: 'server',       label: 'SID',         defaultW: 48  },
  { key: 'sensor_type',  label: 'Type',        defaultW: 70  },
  { key: 'serial_number',label: 'Serial',      defaultW: 120 },
  { key: 'old_offset',   label: 'Old',         defaultW: 60  },
  { key: 'new_offset',   label: 'New',         defaultW: 60  },
  { key: 'calibrated_at',label: 'Calibrated',  defaultW: 92  },
  { key: 'calibrated_by',label: 'By',          defaultW: 130 },
  { key: 'cal_cert',     label: 'Certificate', defaultW: 180 },
];

function buildSensorTable(rows) {
  const thead = `<thead><tr>${SENSOR_COLS.map(c => `
    <th style="width:${c.defaultW}px;"
        class="${sortCol===c.key ? (sortDir===1?'sort-asc':'sort-desc') : ''}"
        onclick="sortBy('${c.key}')">
      ${c.label}
      <span class="rt-resizer" data-col="${c.key}"
            onmousedown="startResize(event,this)"></span>
    </th>`).join('')}</tr></thead>`;

  const tbody = `<tbody>${rows.map(s => {
    const fail = isFailed(s);
    return `<tr class="${fail ? 'failure-row' : ''}">
      <td class="muted mono">#${s.sensor_id}</td>
      <td title="${s.sensor_name || ''}">${s.sensor_name || '<span class="muted">—</span>'}</td>
      <td class="muted" title="${s.zone || ''}">${s.zone || '—'}</td>
      <td class="muted mono">${s.server || '—'}</td>
      <td>${badge(s.sensor_type)}</td>
      <td class="mono muted">${s.serial_number || '—'}</td>
      <td class="mono ${fail ? '' : 'muted'}">${fmtOffset(s.old_offset)}</td>
      <td class="${fail ? 'fail-val' : 'mono muted'}">${fmtOffset(s.new_offset)}</td>
      <td>${fmtDate(s.calibrated_at)}</td>
      <td class="muted" title="${s.calibrated_by||''}">${s.calibrated_by || '—'}</td>
      <td class="muted" title="${s.cal_cert||''}">${s.cal_cert || '—'}</td>
    </tr>`;
  }).join('')}</tbody>`;

  return `<div class="rt-wrap"><table class="rt">${thead}${tbody}</table></div>`;
}

/* ─── Type breakdown table ──────────────────────────────── */
function buildTypesTable() {
  const types = [...new Set(allSensors.map(s => s.sensor_type).filter(Boolean))].sort();
  const rows = types.map(t => {
    const g   = allSensors.filter(s => s.sensor_type === t);
    const cal = g.filter(isCalibrated).length;
    const fail= g.filter(isFailed).length;
    const srv = [...new Set(g.map(s => s.server).filter(Boolean))].join(', ');
    return { t, total: g.length, cal, left: g.length - cal, fail, srv };
  });
  return `<table class="summary">
    <thead><tr>
      <th>Type</th><th>Total</th><th>Calibrated</th><th>Remaining</th><th>Failures</th><th>Servers</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${badge(r.t)}</td>
      <td>${r.total}</td>
      <td class="green-val">${r.cal}</td>
      <td class="${r.left > 0 ? 'orange-val' : 'muted'}">${r.left}</td>
      <td class="${r.fail > 0 ? 'fail-val' : 'muted'}">${r.fail}</td>
      <td class="muted">${r.srv}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

/* ─── Zones table ───────────────────────────────────────── */
function buildZonesTable() {
  const zones = [...new Set(allSensors.map(s => s.zone).filter(Boolean))].sort();
  const rows = zones.map(z => {
    const g   = allSensors.filter(s => s.zone === z);
    const cal = g.filter(isCalibrated).length;
    const fail= g.filter(isFailed).length;
    const srv = [...new Set(g.map(s => s.server).filter(Boolean))].join(', ');
    return { z, total: g.length, cal, left: g.length - cal, fail, srv };
  }).sort((a, b) => b.left - a.left);

  return `<table class="summary">
    <thead><tr>
      <th>Zone</th><th>SID</th><th>Sensors</th><th>Calibrated</th><th>Remaining</th><th>Failures</th>
    </tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td title="${r.z}">${r.z}</td>
      <td class="muted">${r.srv}</td>
      <td>${r.total}</td>
      <td class="green-val">${r.cal}</td>
      <td class="${r.left > 0 ? 'orange-val' : 'muted'}">${r.left}</td>
      <td class="${r.fail > 0 ? 'fail-val' : 'muted'}">${r.fail}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

/* ─── renderTable ───────────────────────────────────────── */
function renderTable() {
  const title = document.getElementById('panel-title');
  const count = document.getElementById('panel-count');
  const area  = document.getElementById('table-area');

  if (currentTab === 'types') {
    title.textContent = 'Sensor type breakdown';
    count.textContent = '';
    area.innerHTML = buildTypesTable();
    return;
  }
  if (currentTab === 'zones') {
    title.textContent = 'Zones';
    count.textContent = '';
    area.innerHTML = buildZonesTable();
    return;
  }

  let rows = allSensors;
  if (currentTab === 'left')       rows = allSensors.filter(s => !isCalibrated(s));
  else if (currentTab === 'calibrated') rows = allSensors.filter(isCalibrated);
  else if (currentTab === 'failures')   rows = allSensors.filter(isFailed);

  rows = applyFilters(rows);

  if (!sortCol) {
    if (currentTab === 'calibrated')
      rows = [...rows].sort((a,b) => new Date(b.calibrated_at) - new Date(a.calibrated_at));
    else
      rows = [...rows].sort((a,b) => (a.zone||'').localeCompare(b.zone||''));
  } else {
    rows = applySort(rows);
  }

  const labels = {
    left: 'Sensors left', calibrated: 'Calibrated this week',
    failures: 'Failures', all: 'All sensors'
  };
  title.textContent = labels[currentTab] || '';
  count.textContent = `${rows.length} sensor${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    area.innerHTML = `<div style="padding:2.5rem;text-align:center;color:var(--text-muted);font-size:13px;">
      No sensors in this view.</div>`;
    return;
  }
  area.innerHTML = buildSensorTable(rows);
}

/* ─── Column resizing ───────────────────────────────────── */
function startResize(e, handle) {
  e.stopPropagation();
  const th = handle.closest('th');
  const startX = e.clientX;
  const startW = th.offsetWidth;
  handle.classList.add('resizing');

  function onMove(e) {
    const newW = Math.max(40, startW + e.clientX - startX);
    th.style.width = newW + 'px';
  }
  function onUp() {
    handle.classList.remove('resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ─── Init ──────────────────────────────────────────────── */
document.getElementById('server-input')
  .addEventListener('keydown', e => { if (e.key === 'Enter') addServer(); });

document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

renderServerTags();
if (servers.length > 0) loadData();
else { showEmpty(true); renderMetrics(); }