/* ─── State ─────────────────────────────────────────────── */
let servers    = JSON.parse(localStorage.getItem('cal_servers') || '[]');
let thresholds = JSON.parse(localStorage.getItem('cal_thresholds') || 'null')
                 || { ...CONFIG.DEFAULT_THRESHOLDS };
let typeColors = JSON.parse(localStorage.getItem('cal_type_colors') || 'null')
                 || { ...CONFIG.DEFAULT_TYPE_COLORS };
loadServerMeta(); // Load server metadata on startup
                 
let allSensors = [];
let currentTab = 'left';
let sortCol    = null;
let sortDir    = 1;
let allExceptions = [];
let zoneSort   = { col: 'left',  dir: -1 };
let typeSort   = { col: 'left',  dir: -1 };
let checkSort  = { col: null,    dir:  1 };
let excSort    = { col: null,    dir:  1 };

const savedRollingDays = localStorage.getItem("rollingDays");

if (savedRollingDays !== null) {
    CONFIG.ROLLING_DAYS = Number(savedRollingDays);
}

// Status message turns red after not being updated for 20 minutes
let lastUpdated = null; // Assuming you set this to Date.now() when fetching data

function updateStatusColor() {
  // Target our new nested span instead of the main status-msg
  const timeEl = document.getElementById('time-display');
  
  if (!timeEl || !lastUpdated) return;
  
  const stale = Date.now() - lastUpdated > 20 * 60 * 1000;
  timeEl.style.color = stale ? 'var(--accent-red)' : 'var(--text-muted)';
}

setInterval(updateStatusColor, 30 * 1000); // check every 30 seconds
//==============================================================

let currentPage = "dashboard";

function showPage(page) {

    currentPage = page;

    document.querySelectorAll(".page").forEach(p => {
        p.style.display = "none";
    });

    document.getElementById("dashboard-page").style.display =
        page === "dashboard" ? "" : "none";

    document.getElementById("summary-page").style.display =
        page === "summary" ? "" : "none";

    document.getElementById("resources-page").style.display =
        page === "resources" ? "" : "none";

    document.getElementById("about-page").style.display =
        page === "about" ? "" : "none";

    document.querySelectorAll(".nav-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.page === page);
    });

    document.getElementById("topbar").style.display =
        page === "dashboard" ? "" : "none";
}

document.querySelectorAll(".nav-btn[data-page]").forEach(btn => {
    btn.onclick = () => showPage(btn.dataset.page);
});



/* ─── Persistence ───────────────────────────────────────── */
function saveServers()    { localStorage.setItem('cal_servers',    JSON.stringify(servers)); }
function saveThresholds() { localStorage.setItem('cal_thresholds', JSON.stringify(thresholds)); }
function saveTypeColors() { localStorage.setItem('cal_type_colors', JSON.stringify(typeColors)); }

/* ─── Derived state helpers ─────────────────────────────── */
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

function getActiveSensors() {
  const showDisabled = document.getElementById('show-disabled')?.checked;
  return allSensors.filter(s =>
    (showDisabled || !s.status || s.status.toUpperCase() !== 'DISABLED') &&
    !isExcepted(s)
  );
}

const CURRENT_YEAR = new Date().getFullYear();

function isExcepted(s) {
  return allExceptions.some(e =>
    e.sensor_id === String(s.sensor_id) &&
    e.server === s.server &&
    e.year === CURRENT_YEAR
  );
}

function wasExceptedLastYear(s) {
  return allExceptions.some(e =>
    e.sensor_id === String(s.sensor_id) &&
    e.server === s.server &&
    e.year === CURRENT_YEAR - 1
  );
}

function getException(s) {
  return allExceptions.find(e =>
    e.sensor_id === String(s.sensor_id) &&
    e.server === s.server &&
    e.year === CURRENT_YEAR
  );
}

/* ─── Formatting ────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return '<span class="muted">—</span>';

  const d = new Date(iso);

  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)} `
       + `${String(d.getHours()).padStart(2, '0')}:`
       + `${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtOffset(v) {
  if (v === null || v === undefined || v === '') return '—';
  return parseFloat(v).toFixed(2);
}

// Hash a string to a stable hue for badge coloring
function strHue(str) {
  if (!str) return 200;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function badge(t) {
  if (!t) return '<span class="muted">—</span>';
  const color = typeColors[t];
  if (color) {
    return `<span class="badge" style="background:${color.bg};color:${color.fg};">${t}</span>`;
  }
  // fallback to hash for unknown types
  const hue = strHue(t);
  return `<span class="badge" style="background:hsl(${hue},30%,15%);color:hsl(${hue},60%,65%);">${t}</span>`;
}

function qualBadge(q) {
  if (!q) return '<span class="muted">—</span>';
  const map = { GOOD: 'qual-good', LINK: 'qual-link', NETWORK: 'qual-network', SENSOR: 'qual-sensor', INIT: 'qual-init' };
  const cls = map[q.toUpperCase()] || 'qual-network';
  return `<span class="qual ${cls}">${q}</span>`;
}

function statusCell(s) {
  if (!s) return '<span class="muted">—</span>';
  const cls = s.toUpperCase() === 'ENABLED' ? 'status-enabled' : 'status-disabled';
  return `<span class="${cls}">${s}</span>`;
}

/* ─── Status bar ────────────────────────────────────────── */
function setStatus(primaryText, timeString) {
  const container = document.getElementById('status-msg');
  
  // If we only passed one argument like setStatus('Loading...'))
  // timeString will be undefined. Just print the raw text.
  if (!timeString) {
    container.innerHTML = primaryText;
    return;
  }
  //if we have both, build formatted string
  container.innerHTML = `${primaryText} total sensors — <span id="time-display">updated ${timeString}</span>`;
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
  const inp = document.getElementById('server-input').value;
  const val = inp.split('-')[0].trim(); // This handles both "150 - University..." AND someone just typing "150"
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

/* ─── Settings ──────────────────────────────────────────── */
/*function toggleSettings() {
    const panel = document.getElementById("settings-panel");

    const isOpen = panel.style.display === "block";

    panel.style.display = isOpen ? "none" : "block";

    if (!isOpen) {
        renderThresholdInputs();
        //renderColorInputs();
    }

    setButtonActive("threshold-btn", !isOpen);
} OLD TOGGLE SETTINGS */

function toggleSettings() {

    const panel = document.getElementById("settings-panel");
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
    setButtonActive("settings-btn", !isOpen);
    if (!isOpen) {
        renderThresholdInputs();
        renderServerConfig();
        document.getElementById("rolling-days").value =
            CONFIG.ROLLING_DAYS;
    }

}

function updateRollingDays() {
    const value = Number(document.getElementById("rolling-days").value);

    if (!Number.isFinite(value) || value < 1) return;

    CONFIG.ROLLING_DAYS = value;
    localStorage.setItem("rollingDays", value);

    renderMetrics();
    renderTable();
}

function toggleServerConfig() {
  const p = document.getElementById('server-config-panel');
  const isOpen = p.style.display === "block";
  p.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) renderServerConfig();
  setButtonActive("server-config-btn", !isOpen);
}

function renderThresholdInputs() {
  document.getElementById('threshold-inputs').innerHTML =
    Object.entries(thresholds).map(([t, v]) => `
      <div class="threshold-row">
        <span class="threshold-type">${t}</span>
        <input type="number" step="0.01" value="${v}" style="width:90px;"
          onchange="thresholds['${t}']=parseFloat(this.value)||0;saveThresholds();renderTable();"/>
        <button class="danger" onclick="deleteThreshold('${t}')">Remove</button>
      </div>`).join('');
}

function addThreshold() {
  const t = document.getElementById('new-type-name').value.trim();
  const v = parseFloat(document.getElementById('new-type-val').value);
  if (!t || isNaN(v)) return;
  thresholds[t] = v;
  saveThresholds();
  document.getElementById('new-type-name').value = '';
  document.getElementById('new-type-val').value  = '';
  renderThresholdInputs();
  renderTable();
}

function deleteThreshold(t) {
  delete thresholds[t];
  saveThresholds();
  renderThresholdInputs();
  renderTable();
}

function renderColorInputs() {
  document.getElementById('color-inputs').innerHTML =
    Object.entries(typeColors).map(([t, c]) => `
      <div class="threshold-row">
        <span class="threshold-type">${badge(t)}</span>
        <label style="font-size:11px;color:var(--text-secondary);">BG</label>
        <input type="color" value="${c.bg}" style="width:44px;height:28px;padding:2px;"
          onchange="typeColors['${t}'].bg=this.value;saveTypeColors();renderColorInputs();renderTable();renderMetrics();"/>
        <label style="font-size:11px;color:var(--text-secondary);">FG</label>
        <input type="color" value="${c.fg}" style="width:44px;height:28px;padding:2px;"
          onchange="typeColors['${t}'].fg=this.value;saveTypeColors();renderColorInputs();renderTable();renderMetrics();"/>
        <button class="danger" onclick="deleteTypeColor('${t}')">Remove</button>
      </div>`).join('');
}

function addTypeColor() {
  const t  = document.getElementById('new-color-type').value.trim();
  const bg = document.getElementById('new-color-bg').value;
  const fg = document.getElementById('new-color-fg').value;
  if (!t) return;
  typeColors[t] = { bg, fg };
  saveTypeColors();
  document.getElementById('new-color-type').value = '';
  renderColorInputs();
  renderTable();
}

function deleteTypeColor(t) {
  delete typeColors[t];
  saveTypeColors();
  renderColorInputs();
  renderTable();
}


function setButtonActive(id, active) {
    document.getElementById(id)?.classList.toggle("active", active);
}

/* ─── Data loading ──────────────────────────────────────── */
async function loadData() {
  if (!servers.length) {
    allSensors = [];
    allExceptions = [];
    renderMetrics();
    showEmpty(true);
    return;
  }
  showEmpty(false);
  setStatus('Loading…');
  try {
    const [sensorResults] = await Promise.all([
      Promise.all(servers.map(s =>
        fetch(`${CONFIG.WORKER_URL}/calibrations?server=${s}`, {
          headers: { 'X-Api-Key': CONFIG.API_KEY }
        }).then(r => r.json())
      )),
      loadExceptions(),
      loadServerMeta(),
    ]);
    // Job info needs server metadata in order to determine the customer.
    await loadJobInfo();
    allSensors = sensorResults.flat();

    lastUpdated = Date.now();
    //setStatus(`${allSensors.length} total sensors — updated ${new Date().toLocaleTimeString()}`);
    setStatus(allSensors.length, new Date().toLocaleTimeString());
    updateStatusColor(); // reset to normal immediately after a fresh load

    populateFilters();
    renderMetrics();
    renderTable();
    updateLatestCalibration();
  } catch (e) {
    setStatus('Error loading data');
    console.error(e);
  }
}

async function loadExceptions() {
  try {
    const results = await Promise.all(
      servers.map(s =>
        fetch(`${CONFIG.WORKER_URL}/exceptions?server=${s}`, {
          headers: { 'X-Api-Key': CONFIG.API_KEY }
        }).then(r => r.json())
      )
    );
    allExceptions = results.flat();
  } catch (e) {
    console.error('Failed to load exceptions', e);
  }
}

function showEmpty(b) {
  document.getElementById('empty-state').style.display  = b ? 'block' : 'none';
  document.getElementById('main-panel').style.display   = b ? 'none'  : 'block';
  //document.getElementById('filter-bar').style.display   = b ? 'none'  : 'flex';
}


function updateLatestCalibration() {
  const el = document.getElementById('latest-cal-msg');
  if (!el) return;
  const calibrated = allSensors.filter(s => s.calibrated_at);
  if (!calibrated.length) { el.textContent = ''; return; }
  const latest = calibrated.reduce((a, b) =>
    a.calibrated_at > b.calibrated_at ? a : b
  );
  el.textContent = ` Latest Calibration: ${latest.sensor_name || '#' + latest.sensor_id} (${fmtDate(latest.calibrated_at)})`;
}

let hasCelebratedCompletion = false;


/* ─── Metrics ───────────────────────────────────────────── */
function renderMetrics() {
  const sensors = getActiveSensors(); 
  const total = sensors.length; //total enabled sensors
  const cal   = sensors.filter(isCalibrated).length; //total calibrated sensors
  const left  = total - cal;
  const fail  = sensors.filter(isFailed).length;
  const pct   = total > 0 ? Math.round((cal / total) * 100) : 0;
  const r = 26, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
  const track = 'var(--border)';
  const excepted = allSensors.filter(isExcepted).length;
  const check = allSensors.filter(s =>   //sensors in check
    s.status?.toUpperCase() === 'ENABLED' &&
    s.quality &&
    s.quality.toUpperCase() !== 'GOOD'
  ).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const calToday = sensors.filter(s =>
    s.calibrated_at && new Date(s.calibrated_at) >= today
  ).length;

  const calYesterday = sensors.filter(s => {
    if (!s.calibrated_at) return false;
    const d = new Date(s.calibrated_at);
    return d >= yesterday && d < today;
  }).length;

  


  document.getElementById('metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Enabled Sensors</div>
      <div class="metric-value" title="Total enabled sensors across all added servers">${total}</div>
      <div class="metric-sub">${servers.length} server${servers.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="metric-card">
  <div class="metric-label">Calibrated (${CONFIG.ROLLING_DAYS}d)</div>
  <div class="metric-value green">${cal}</div>
  <div style="margin-top:3px; padding-top:3px; display:flex; justify-content: center; gap:10px; font-size:13px; color:var(--text-secondary);">
    <span>Today: <span style="color:var(--accent-green); font-weight:500;">${calToday}</span></span>
    <span>Yesterday: <span style="color:var(--text-primary); font-weight:500;">${calYesterday}</span></span>
  </div>
</div>
    <div class="metric-card">
      <div class="metric-label">Remaining</div>
      <div class="metric-value blue">${left}</div>
      <div class="metric-sub">not yet calibrated</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Failures</div>
      <div class="metric-value red">${fail}</div>
      <div class="metric-sub">offset exceeded</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">In CHECK</div>
      <div class="metric-value" style="color:white);">${check}</div>
      <div class="metric-sub">sensors with errors</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Exceptions</div>
      <div class="metric-value orange" style="color:var(--accent-orange);">${excepted}</div>
      <div class="metric-sub">this year</div>
    </div>
    <div id="donut-card" class="metric-card donut-card">
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Progress ${pct}%">
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="${track}" stroke-width="7"/>
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--accent-green)" stroke-width="7"
          stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
          stroke-linecap="round" transform="rotate(-90 32 32)"/>
        <text x="32" y="37" text-anchor="middle" font-size="12" font-weight="600"
          fill="var(--text-primary)">${pct}%</text>
      </svg>
      <div class="donut-legend">
        <div class="metric-label">Progress</div>
        <div class="donut-legend-item">
          <span class="donut-dot" style="background:var(--accent-green)"></span>Done
        </div>
        <div class="donut-legend-item">
          <span class="donut-dot" style="background:${track}"></span>Left
        </div>
      </div>
    </div>`;

    if((left == 0) && (!hasCelebratedCompletion) && (cal > 0)) {
      hasCelebratedCompletion = true;
      fireConfettiFromElement('#donut-card');
      const latestCalibration = sensors
        .map(sensor => sensor.calibrated_at)
        .filter(Boolean)
        .sort()
        .at(-1);
      const lastCalibrated = String(latestCalibration || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || null;
      saveJobInfo({ silent: true, lastCalibrated });
    }
}

/* ─── Filters ───────────────────────────────────────────── */
function populateFilters() {
const sensors = getActiveSensors();
  const types = [...new Set(sensors.map(s => s.sensor_type).filter(Boolean))].sort();
  const tf = document.getElementById('type-filter');
  const curType = tf.value;
  tf.innerHTML = '<option value="">All types</option>'
    + types.map(t => `<option value="${t}"${t === curType ? ' selected' : ''}>${t}</option>`).join('');

  const sf = document.getElementById('server-filter');
  const curSrv = sf.value;
  sf.innerHTML = '<option value="">All servers</option>'
    + servers.map(s => `<option value="${s}"${s === curSrv ? ' selected' : ''}>${s}</option>`).join('');
}

function applyFilters(rows) {
  const tf = document.getElementById('type-filter').value;
  const sf = document.getElementById('server-filter').value;
  const q  = document.getElementById('search-input').value.toLowerCase();
  const showDisabled = document.getElementById('show-disabled').checked;

  return rows.filter(s =>
    (showDisabled || !s.status || s.status.toUpperCase() !== 'DISABLED') &&
    (!tf || s.sensor_type === tf) &&
    (!sf || s.server === sf) &&
    (!q  || (s.sensor_name  || '').toLowerCase().includes(q)
          || (s.zone         || '').toLowerCase().includes(q)
          || (s.cp_address   || '').toLowerCase().includes(q)
          || (s.access_point || '').toLowerCase().includes(q)
          || String(s.sensor_id).includes(q))
  );
}

function applySort(rows) { //sort for main tables
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
//sort for the other tables
function sortZone(col)  { toggleSummarySort(zoneSort,  col); }
function sortType(col)  { toggleSummarySort(typeSort,  col); }
function sortCheck(col) { toggleSummarySort(checkSort, col); }
function sortExc(col)   { toggleSummarySort(excSort,   col); }

/* ─── Tab switching ─────────────────────────────────────── */
function switchTab(tab) {
  currentTab = tab;
  sortCol = null;
  sortDir = 1;
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  const showFilter = ['left','calibrated','failures','all'].includes(tab);
  document.getElementById('filter-bar').style.display = showFilter ? 'flex' : 'none';
  if(tab === 'jobinfo') {
    loadData(); //refresh job info when switching to that tab
  }
  renderTable();
}

function sortBy(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = 1; }
  renderTable();
}

//shared sort toggler for summary tables ====================
function toggleSummarySort(state, col) {
  if (state.col === col) state.dir *= -1;
  else { state.col = col; state.dir = 1; }
  renderTable();
}

function applySummarySort(rows, state, key) {
  if (!state.col) return rows;
  return [...rows].sort((a, b) => {
    let av = a[state.col] ?? '', bv = b[state.col] ?? '';
    const an = parseFloat(av), bn = parseFloat(bv);
    if (!isNaN(an) && !isNaN(bn)) { av = an; bv = bn; }
    if (av < bv) return -state.dir;
    if (av > bv) return  state.dir;
    return 0;
  });
}

function thSort(label, col, state, toggleFn) {
  const cls = state.col === col ? (state.dir === 1 ? 'sort-asc' : 'sort-desc') : '';
  return `<th class="${cls}" onclick="${toggleFn}('${col}')" style="cursor:pointer;">
    ${label}<span class="rt-resizer" onmousedown="startResize(event,this)"></span>
  </th>`;
}
//==============================================================



function isUnderWarranty(serial) {
  if (!serial) return false;
  // Find 4-digit group after a dash: matches "1225" in "RM-1225-4234"
  const m = serial.match(/-(\d{2})(\d{2})-/);
  if (!m) return false;
  const month = parseInt(m[1], 10);
  const year  = 2000 + parseInt(m[2], 10);
  if (month < 1 || month > 12) return false;
  const manufactured = new Date(year, month - 1, 1);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1); // 1 year warranty
  return manufactured >= cutoff;
}


/* ─── Sensor columns definition ─────────────────────────── */
const SENSOR_COLS = [
  { key: 'sensor_id',    label: 'ID',          defaultW: 52  },
  { key: 'cp_address',   label: 'CP Addr',      defaultW: 90  },
  { key: 'sensor_name',  label: 'Sensor name',  defaultW: 200 },
  { key: 'zone',         label: 'Zone',         defaultW: 140 },
  { key: 'server',       label: 'SID',          defaultW: 48  },
  { key: 'sensor_type',  label: 'Type',         defaultW: 110 },
  { key: 'serial_number',label: 'Serial',       defaultW: 120 },
  { key: 'access_point', label: 'Access point', defaultW: 180 },
  { key: 'quality',      label: 'Qual',         defaultW: 70  },
  { key: 'status',       label: 'Status',       defaultW: 75  },
  { key: 'old_offset',   label: 'Old',          defaultW: 55  },
  { key: 'new_offset',   label: 'New',          defaultW: 55  },
  { key: 'calibrated_at',label: 'Calibrated',   defaultW: 92  },
  { key: 'calibrated_by',label: 'By',           defaultW: 130 },
  { key: 'cal_cert',     label: 'Certificate',  defaultW: 180 },
  { key: '_exception',   label: 'Exception',    defaultW: 90 },
];

function buildSensorTable(rows) {
  const thead = `<thead><tr>${SENSOR_COLS.map(c => `
    <th style="width:${c.defaultW}px;"
        class="${sortCol===c.key ? (sortDir===1?'sort-asc':'sort-desc') : ''}"
        onclick="sortBy('${c.key}')">
      ${c.label}
      <span class="rt-resizer" onmousedown="startResize(event,this)"></span>
    </th>`).join('')}</tr></thead>`;

  const tbody = `<tbody>${rows.map(s => {
    const url = sensorUrl(s.sensor_id, s.server);
    const nameCell = url
      ? `<a href="${url}" target="_blank" style="color:var(--text-primary);text-decoration:underline;border-bottom:0.5px solid var(--border);" title="Open Calibration">${s.sensor_name || '—'}</a>`
      : (s.sensor_name || '<span class="muted">—</span>');
    const excepted = isExcepted(s);
    const repeated = wasExceptedLastYear(s);
    const excBtn = excepted
      ? `<span class="qual qual-warn" style="cursor:default;">excepted</span>`
      : `<button onclick="openExceptionModal('${s.sensor_id}','${s.server}')"
          style="font-size:11px;padding:3px 8px;">+ exception</button>`;
    const repeatBadge = !excepted && repeated
      ? `<span class="qual qual-warn" style="margin-left:4px;" title="Was an exception in ${CURRENT_YEAR-1}">repeat</span>`
      : '';
    const fail = isFailed(s);
    const done = isCalibrated(s) && !isFailed(s);
    return `<tr class="${fail ? 'failure-row' : done ? 'done-row' : ''}">
      <td class="muted mono">#${s.sensor_id}</td>
      <td class="mono muted" title="${s.cp_address||''}">${s.cp_address || '<span class="muted">—</span>'}</td>
      <td title="${s.sensor_name||''}">${nameCell}${repeatBadge}</td>
      <td class="muted" title="${s.zone||''}">${s.zone || '—'}</td>
      <td class="muted mono">${s.server || '—'}</td>
      <td>${badge(s.sensor_type)}</td>
      <td title="${s.serial_number||''}">
        ${s.serial_number
          ? (isFailed(s) && isUnderWarranty(s.serial_number)
              ? `<span class="warranty-serial" title="Under warranty — sensor should be replaced at no charge">${s.serial_number}</span>`
              : `<span class="mono muted">${s.serial_number}</span>`)
          : '<span class="muted">—</span>'}
      </td>
      <td class="muted" title="${s.access_point||''}">${s.access_point || '—'}</td>
      <td>${qualBadge(s.quality)}</td>
      <td>${statusCell(s.status)}</td>
      <td class="mono muted">${fmtOffset(s.old_offset)}</td>
      <td class="${fail ? 'fail-val' : 'mono muted'}">${fmtOffset(s.new_offset)}</td>
      <td>${fmtDate(s.calibrated_at)}</td>
      <td class="muted" title="${s.calibrated_by||''}">${s.calibrated_by || '—'}</td>
      <td class="muted" title="${s.cal_cert||''}">${s.cal_cert || '—'}</td>
      <td>${excBtn}</td>
    </tr>`;
  }).join('')}</tbody>`;

  return `<div class="rt-wrap"><table class="rt">${thead}${tbody}</table></div>`;
}

/* ─── Type breakdown table ──────────────────────────────── */
function buildTypesTable() {
  const sensors = allSensors.filter(s =>
    !s.status || s.status.toUpperCase() !== 'DISABLED'
  );
  const types = [...new Set(sensors.map(s => s.sensor_type).filter(Boolean))].sort();
  let rows = types.map(t => {
    const g   = sensors.filter(s => s.sensor_type === t);
    const cal = g.filter(s => isCalibrated(s) && !isExcepted(s)).length;
    const exc = g.filter(isExcepted).length;
    const fail= g.filter(isFailed).length;
    const left= g.length - cal - exc;
    const srv = [...new Set(g.map(s => s.server).filter(Boolean))].join(', ');
    return { t, total: g.length, cal, exc, left, fail, srv, done: left === 0 };
  });
  rows = applySummarySort(rows, typeSort, 't');

  return `<div class="rt-wrap"><table class="rt">
    <thead><tr>
      ${thSort('Type',       't',     typeSort, 'sortType')}
      ${thSort('Total',      'total', typeSort, 'sortType')}
      ${thSort('Calibrated', 'cal',   typeSort, 'sortType')}
      ${thSort('Exceptions', 'exc',   typeSort, 'sortType')}
      ${thSort('Remaining',  'left',  typeSort, 'sortType')}
      ${thSort('Failures',   'fail',  typeSort, 'sortType')}
      ${thSort('Servers',    'srv',   typeSort, 'sortType')}
    </tr></thead>
    <tbody>${rows.map(r => {
      return `<tr class="${r.done ? 'done-row' : ''}">
        <td>${badge(r.t)}</td>
        <td>${r.total}</td>
        <td class="green-val">${r.cal}</td>
        <td class="${r.exc  > 0 ? 'orange-val' : 'muted'}">${r.exc}</td>
        <td class="${r.left > 0 ? 'orange-val' : 'muted'}">${r.left}</td>
        <td class="${r.fail > 0 ? 'fail-val'   : 'muted'}">${r.fail}</td>
        <td class="muted">${r.srv}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* ─── Zones table ───────────────────────────────────────── */
function buildZonesTable() {
  const sensors = allSensors.filter(s =>
    !s.status || s.status.toUpperCase() !== 'DISABLED'
  );
  const zones = [...new Set(sensors.map(s => s.zone).filter(Boolean))].sort();
  let rows = zones.map(z => {
    const g   = sensors.filter(s => s.zone === z);
    const cal = g.filter(s => isCalibrated(s) && !isExcepted(s)).length;
    const exc = g.filter(isExcepted).length;
    const fail= g.filter(isFailed).length;
    const left= g.length - cal - exc;
    const srv = [...new Set(g.map(s => s.server).filter(Boolean))].join(', ');
    return { z, srv, total: g.length, cal, exc, left, fail, done: left <= 0 };
  });
  rows = applySummarySort(rows, zoneSort, 'z');

  return `<div class="rt-wrap"><table class="rt">
    <thead><tr>
      ${thSort('Zone',       'z',     zoneSort, 'sortZone')}
      ${thSort('SID',        'srv',   zoneSort, 'sortZone')}
      ${thSort('Sensors',    'total', zoneSort, 'sortZone')}
      ${thSort('Calibrated', 'cal',   zoneSort, 'sortZone')}
      ${thSort('Exceptions', 'exc',   zoneSort, 'sortZone')}
      ${thSort('Remaining',  'left',  zoneSort, 'sortZone')}
      ${thSort('Failures',   'fail',  zoneSort, 'sortZone')}
    </tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.done ? 'done-row' : ''}">
      <td title="${r.z}">${r.z}</td>
      <td class="muted">${r.srv}</td>
      <td>${r.total}</td>
      <td class="green-val">${r.cal}</td>
      <td class="${r.exc  > 0 ? 'orange-val' : 'muted'}">${r.exc}</td>
      <td class="${r.left > 0 ? 'orange-val' : 'muted'}">${r.left}</td>
      <td class="${r.fail > 0 ? 'fail-val'   : 'muted'}">${r.fail}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

/* ─── renderTable ───────────────────────────────────────── */
function renderTable() {
  const title = document.getElementById('panel-title');
  const count = document.getElementById('panel-count');
  const area  = document.getElementById('table-area');

  // sync filter bar visibility with current tab on every render
  const showFilter = ['left','calibrated','failures','all'].includes(currentTab);
  document.getElementById('filter-bar').style.display = showFilter ? 'flex' : 'none';

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
  if (currentTab === 'exceptions') {
    title.textContent = `Exceptions ${CURRENT_YEAR}`;
    count.textContent = `${allExceptions.filter(e => e.year === CURRENT_YEAR).length}`;
    area.innerHTML = buildExceptionsTable();
    return;
  }
    if (currentTab === 'jobinfo') {
    title.textContent = 'Job Information';
    count.textContent = currentCustomer || 'No customer assigned';
    area.innerHTML = buildJobInfoHTML();
    buildJobInfoTab();
    return;
  }
  if (currentTab === 'check') {
  title.textContent = 'Sensors in CHECK';
  const checkSensors = allSensors.filter(s =>
    s.status?.toUpperCase() === 'ENABLED' &&
    s.quality &&
    s.quality.toUpperCase() !== 'GOOD'
  );
  count.textContent = `${checkSensors.length} sensor${checkSensors.length !== 1 ? 's' : ''}`;
  area.innerHTML = buildCheckTable(checkSensors);
  return;
  }

  let rows = getActiveSensors();
  if (currentTab === 'left')        rows = rows.filter(s => !isCalibrated(s));
  else if (currentTab === 'calibrated') rows = rows.filter(isCalibrated);
  else if (currentTab === 'failures')   rows = rows.filter(isFailed);

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
    failures: 'Failures', all: 'All sensors',
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
  const th     = handle.closest('th');
  const startX = e.clientX;
  const startW = th.offsetWidth;
  handle.classList.add('resizing');

  function onMove(e) {
    th.style.width = Math.max(40, startW + e.clientX - startX) + 'px';
  }
  function onUp() {
    handle.classList.remove('resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

let serverMeta = {}; // populated on load, keyed by server ID

async function loadServerMeta() {
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/servers`, {
      headers: { 'X-Api-Key': CONFIG.API_KEY }
    });
    const rows = await res.json();
    serverMeta = Object.fromEntries(rows.map(r => [r.server, r]));

    // --- NEW DATALIST LOGIC ---
    const datalist = document.getElementById('server-suggestions');
    if (datalist) {
      datalist.innerHTML = ''; // Clear just in case it runs twice
      
      Object.values(serverMeta).forEach(s => {
        // Fallback to notes if customer is null/empty
        const displayName = s.customer || s.notes || 'Unknown Location';
        
        const option = document.createElement('option');
        // Setting the value to "ID - Name" allows searching by both!
        option.value = `${s.server} - ${displayName}`;
        datalist.appendChild(option);
      });
    }
    // --------------------------
  } catch (e) {
    console.error('Failed to load server metadata', e);
  }
}

const VERSION_PATHS = {
  'G3.0': '/guardian/calibration/calsensor.php',
  'G2.1': '/arms2/calibration/calsensor.php',
  'G2.0': '/arms2/calsensor.php',
  'ARMS': '/arms/admin/index.php?mode=11&',
};

const VERSION_PORTS = {
  'G3.0': (server) => `7${server}`,
  'G2.1': (server) => `7${server}`,
  'G2.0': (server) => `7${server}`,
  'ARMS': (server) => `7${server}`,
  // if port format ever differs by version, handle it here
};

function sensorUrl(sensor_id, server) {
  const meta = serverMeta[server];
  if (!meta || !meta.hostname) return null;
  const version = meta.version || '3.0';
  const path = VERSION_PATHS[version] || VERSION_PATHS['3.0'];
  const port = `7${server}`;
  if(version === "ARMS"){
    return `https://${meta.hostname}:${port}${path}&id=${sensor_id}`;
  }else{
    return `https://${meta.hostname}:${port}${path}?id=${sensor_id}`;
  }
}

async function renderServerConfig() {
  const el = document.getElementById('server-config-list');

  if (!Object.keys(serverMeta).length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">No servers configured yet.</div>';
    return;
  }

  el.innerHTML = `
    <div class="threshold-row server-header">
      <span class="threshold-type">Server</span>
      <span class="badge server-version-header">Version</span>
      <span class="server-customer">Customer</span>
      <span class="server-notes">Notes</span>
      <span class="server-hostname">Hostname</span>
      <span class="server-actions">Actions</span>
    </div>

    ${Object.values(serverMeta).map(r => `
      <div class="threshold-row">
        <span class="threshold-type">${r.server}</span>
        <span class="badge">v${r.version}</span>
        <span class="server-customer">${r.customer || '<span class="muted">No customer</span>'}</span>
        <span class="server-notes">${r.notes || '—'}</span>
        <span class="server-hostname">${r.hostname || '—'}</span>
        <button class="danger" onclick="deleteServerConfig('${r.server}')">Remove</button>
      </div>
    `).join('')}
  `;
}

async function saveServerConfig() {
  const server   = document.getElementById('sc-server').value.trim();
  const version  = document.getElementById('sc-version').value;
  const hostname = document.getElementById('sc-hostname').value.trim();
  const customer = document.getElementById('sc-customer').value.trim() || null;
  const notes    = document.getElementById('sc-notes').value.trim();
  if (!server || !hostname) return;

  await fetch(`${CONFIG.WORKER_URL}/servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': CONFIG.API_KEY },
    body: JSON.stringify({ server, version, hostname, notes, customer })
  });

  document.getElementById('sc-server').value   = '';
  document.getElementById('sc-hostname').value = 'ics1.ca.isensix.com';
  document.getElementById('sc-customer').value = '';
  document.getElementById('sc-notes').value    = '';

  await loadServerMeta();
  renderServerConfig();
  renderTable();
}

async function deleteServerConfig(server) {
  await fetch(`${CONFIG.WORKER_URL}/servers/${server}`, {
    method: 'DELETE',
    headers: { 'X-Api-Key': CONFIG.API_KEY }
  });
  await loadServerMeta();
  renderServerConfig();
  renderTable();
}


//Exception modal and save functions ======================
function openExceptionModal(sensor_id, server) {
  const sensor = allSensors.find(s =>
    String(s.sensor_id) === String(sensor_id) && s.server === server
  );
  if (!sensor) return;

  const lastYear = wasExceptedLastYear(sensor);
  const lastYearEx = allExceptions.find(e =>
    e.sensor_id === String(sensor_id) &&
    e.server === server &&
    e.year === CURRENT_YEAR - 1
  );

  const techOptions = CONFIG.TECHNICIANS
    .map(t => `<option value="${t}">${t}</option>`)
    .join('');

  const modal = document.createElement('div');
  modal.id = 'exception-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.7);
    display:flex;align-items:center;justify-content:center;z-index:1000;
  `;
  modal.innerHTML = `
    <div style="background:var(--bg-panel);border:0.5px solid var(--border);
      border-radius:var(--radius-lg);padding:24px;width:420px;display:flex;
      flex-direction:column;gap:14px;">
      <div style="font-size:14px;font-weight:600;">Mark as Exception</div>
      <div style="font-size:12px;color:var(--text-secondary);">
        <span style="color:var(--text-primary);font-weight:500;">${sensor.cp_address}</span>
        ${sensor.sensor_name || ''}
        <span class="muted"> — ${sensor.zone || ''}</span>
      </div>
      ${lastYear ? `
        <div style="background:rgba(196,122,26,0.1);border:0.5px solid rgba(196,122,26,0.3);
          border-radius:var(--radius-sm);padding:8px 10px;font-size:12px;color:var(--accent-orange);">
          ⚠ This sensor was also an exception in ${CURRENT_YEAR - 1}
          ${lastYearEx?.reason ? `— "${lastYearEx.reason}"` : ''}
        </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;">Reason</label>
        <input id="exc-reason" type="text" placeholder="e.g. No access, customer declined..."
          style="width:100%;" list="options"/>
        <datalist id="options">
          <option value="Sensor Removed">
          <option value="Not in Use">
          <option value="Check Network">
          <option value="Check Sensor">
          <option value="Bad CP">
          <option value="No access to sensor">
          <option value="Replacement sensor not arrived">
          <option value="Will be calibrated by customer">
        </datalist>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;">Added by</label>
        <select id="exc-added-by" style="width:100%;">
          <option value="">Select technician...</option>
          ${techOptions}
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
        <button onclick="closeExceptionModal()">Cancel</button>
        <button class="primary" onclick="saveException('${sensor_id}','${server}')">Save exception</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('exc-reason').focus();
}

function closeExceptionModal() {
  document.getElementById('exception-modal')?.remove();
}

async function saveException(sensor_id, server) {
  const sensor = allSensors.find(s =>
    String(s.sensor_id) === String(sensor_id) && s.server === server
  );
  const reason   = document.getElementById('exc-reason').value.trim();
  const added_by = document.getElementById('exc-added-by').value;
  if (!reason || !added_by) {
    document.getElementById('exc-reason').style.borderColor =
      !reason ? 'var(--accent-red)' : '';
    return;
  }

  await fetch(`${CONFIG.WORKER_URL}/exceptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': CONFIG.API_KEY },
    body: JSON.stringify({
      sensor_id:   String(sensor_id),
      server,
      sensor_name: sensor?.sensor_name ?? null,
      zone:        sensor?.zone ?? null,
      reason,
      year:        CURRENT_YEAR,
      added_by,
    })
  });

  closeExceptionModal();
  window.location.reload();
}

// exception table for CHECK tab ==========================
function buildCheckTable(sensors) {
  if (!sensors.length) {
    return `<div style="padding:2.5rem;text-align:center;color:var(--text-muted);font-size:13px;">
      No sensors in CHECK.</div>`;
  }

  let rows = sensors.map(s => ({
    ...s,
    _excepted:  isExcepted(s),
    _calibrated: isCalibrated(s),
    _resolved:  isExcepted(s) || isCalibrated(s),
  }));
  rows = applySummarySort(rows, checkSort, 'sensor_id');
  if (!checkSort.col) {
    rows.sort((a, b) => a._resolved - b._resolved || (a.zone||'').localeCompare(b.zone||''));
  }

  return `<div class="rt-wrap"><table class="rt">
    <thead><tr>
      ${thSort('ID',         'sensor_id',  checkSort, 'sortCheck')}
      ${thSort('CP Addr',    'cp_address', checkSort, 'sortCheck')}
      ${thSort('Sensor',     'sensor_name',checkSort, 'sortCheck')}
      ${thSort('Zone',       'zone',       checkSort, 'sortCheck')}
      ${thSort('SID',        'server',     checkSort, 'sortCheck')}
      ${thSort('Quality',    'quality',    checkSort, 'sortCheck')}
      ${thSort('Exception',  '_excepted',  checkSort, 'sortCheck')}
      ${thSort('Calibrated', '_calibrated',checkSort, 'sortCheck')}
      <th></th>
    </tr></thead>
    <tbody>${rows.map(s => `<tr class="${s._resolved ? 'done-row' : ''}">
      <td class="muted mono">#${s.sensor_id}</td>
      <td class="mono muted">${s.cp_address || '—'}</td>
      <td title="${s.sensor_name||''}">${s.sensor_name || '—'}</td>
      <td class="muted">${s.zone || '—'}</td>
      <td class="muted mono">${s.server || '—'}</td>
      <td>${qualBadge(s.quality)}</td>
      <td style="color:${s._excepted  ? 'var(--accent-green)' : s._resolved ? 'var(--accent-green)' : 'var(--accent-red)'};font-weight:500;">${s._excepted  ? 'YES' : 'NO'}</td>
      <td style="color:${s._calibrated? 'var(--accent-green)' : s._resolved ? 'var(--accent-green)' : 'var(--accent-red)'};font-weight:500;">${s._calibrated? 'YES' : 'NO'}</td>
      <td>${s._excepted
        ? `<span class="qual qual-good" style="cursor:default;">excepted</span>`
        : `<button onclick="openExceptionModal('${s.sensor_id}','${s.server}')" style="font-size:11px;padding:3px 8px;">+ exception</button>`
      }</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}


// exception tab rendering ==========================
function buildExceptionsTable() {
  const current  = allExceptions.filter(e => e.year === CURRENT_YEAR);
  const prevYear = allExceptions.filter(e => e.year === CURRENT_YEAR - 1);
  const prevIds  = new Set(prevYear.map(e => `${e.sensor_id}|${e.server}`));

  if (!current.length) {
    return `<div style="padding:2.5rem;text-align:center;color:var(--text-muted);font-size:13px;">
      No exceptions logged for ${CURRENT_YEAR}.</div>`;
  }

  let rows = current.map(e => ({ ...e, _repeat: prevIds.has(`${e.sensor_id}|${e.server}`) }));
  rows = applySummarySort(rows, excSort, 'sensor_id');

  return `<div class="rt-wrap"><table class="rt">
    <thead><tr>
      ${thSort('ID',       'sensor_id',  excSort, 'sortExc')}
      ${thSort('Sensor',   'sensor_name',excSort, 'sortExc')}
      ${thSort('Zone',     'zone',       excSort, 'sortExc')}
      ${thSort('SID',      'server',     excSort, 'sortExc')}
      ${thSort('Reason',   'reason',     excSort, 'sortExc')}
      ${thSort('Added by', 'added_by',   excSort, 'sortExc')}
      ${thSort('Date',     'added_at',   excSort, 'sortExc')}
      ${thSort('Repeat',   '_repeat',    excSort, 'sortExc')}
      <th></th>
    </tr></thead>
    <tbody>${rows.map(e => `<tr>
      <td class="muted mono">#${e.sensor_id}</td>
      <td>${e.sensor_name || '—'}</td>
      <td class="muted">${e.zone || '—'}</td>
      <td class="muted mono">${e.server}</td>
      <td>${e.reason}</td>
      <td class="muted">${e.added_by || '—'}</td>
      <td class="muted">${fmtDate(e.added_at)}</td>
      <td>${e._repeat
        ? `<span class="qual qual-warn" title="Also excepted in ${CURRENT_YEAR-1}">repeat</span>`
        : '<span class="muted">—</span>'}</td>
      <td><button class="danger" onclick="removeException(${e.id})">Remove</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

async function removeException(id) {
  await fetch(`${CONFIG.WORKER_URL}/exceptions/${id}`, {
    method: 'DELETE',
    headers: { 'X-Api-Key': CONFIG.API_KEY }
  });
  window.location.reload();
}


let autoRefreshInterval = null;

function toggleAutoRefresh() {
  const btn = document.getElementById('auto-refresh-btn');
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    btn.textContent = '⏱ Auto-refresh: Off';
    btn.classList.remove('active');
  } else {
    autoRefreshInterval = setInterval(loadData, 3 * 60 * 1000);
    btn.textContent = '⏱ Auto-refresh: On';
    btn.classList.add('active');
  }
}




// -===================== JOB INFO STUFF =========================
let jobInfo = {};
let currentCustomer = null;

function detectHardware() {
  const active = allSensors.filter(s => s.status?.toUpperCase() === 'ENABLED');
  let hasArms = false, hasGuardian = false;
  for (const s of active) {
    const cp = s.cp_address || '';
    if (/^\d{4,6}$/.test(cp)) hasArms = true;
    if (/\d{2}\.\w{2}\.\w{2}/.test(cp)) hasGuardian = true;
  }
  if (hasArms && hasGuardian) return 'Mix';
  if (hasArms) return 'ARMS';
  if (hasGuardian) return 'Guardian';
  return '—';
}

function detectMeters() {
  const types = new Set(allSensors
    .filter(s => s.status?.toUpperCase() === 'ENABLED')
    .map(s => (s.sensor_type || '').toUpperCase())
  );
  const meters = ['RE'];
  if ([...types].some(t => t.includes('HUMID') || t === 'HU')) meters.push('HU');
  if ([...types].some(t => t.includes('CO2'))) meters.push('CO2');
  if ([...types].some(t => t.includes('DIFF') || t.includes('DP'))) meters.push('DP');
  return meters;
}

function detectO2Count() {
  return allSensors.filter(s =>
    s.status?.toUpperCase() === 'ENABLED' &&
    (s.sensor_type || '').toUpperCase().includes('O2')
  ).length;
}

function getCustomerWarning() {
  const counts = {};
  servers.forEach(s => {
    const c = serverMeta[s]?.customer;
    if (c) counts[c] = (counts[c] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  if (entries.length <= 1) return null;
  const majority = entries[0][0];
  const mismatched = servers.filter(s =>
    serverMeta[s]?.customer && serverMeta[s].customer !== majority
  );
  if (!mismatched.length) return null;
  return `⚠ Servers ${mismatched.join(', ')} appear to belong to a different customer (${[...new Set(mismatched.map(s => serverMeta[s]?.customer))].join(', ')})`;
}

async function loadJobInfo() {
  const counts = {};
  servers.forEach(s => {
    const c = serverMeta[s]?.customer;
    if (c) counts[c] = (counts[c] || 0) + 1;
  });
  currentCustomer = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0] || null;
  if (!currentCustomer) { jobInfo = {}; return; }
  try {
    const res = await fetch(
      `${CONFIG.WORKER_URL}/jobinfo/${encodeURIComponent(currentCustomer)}`,
      { headers: { 'X-Api-Key': CONFIG.API_KEY } }
    );
    jobInfo = await res.json();
  } catch(e) {
    console.error('Failed to load job info', e);
    jobInfo = {};
  }

  const el = document.getElementById('customer-display');
  if (!el) return;
  if (currentCustomer === null || currentCustomer === undefined || currentCustomer === '') return;
  if (   el.textContent = currentCustomer || '—');
  
}

async function saveJobInfo({ silent = false, lastCalibrated = null } = {}) {
  if (!currentCustomer) {
    if (!silent) {
      alert('No customer assigned to these servers. Set a customer in the Servers panel first.');
    }
    return;
  }
  let editorToken = sessionStorage.getItem('cal_editor_token');
  if (!editorToken && silent) return;
  if (!editorToken) {
    editorToken = prompt('Enter the editor password to save job information:')?.trim();
    if (!editorToken) return;
    sessionStorage.setItem('cal_editor_token', editorToken);
  }

  const get = (id, key) => {
    const el = document.getElementById(id);
    return el ? (el.value.trim() || null) : (jobInfo[key] ?? null);
  };
  const getNum = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return jobInfo[key] ?? null;
    const value = parseInt(el.value, 10);
    return Number.isNaN(value) ? null : value;
  };
  const active  = allSensors.filter(s => s.status?.toUpperCase() === 'ENABLED');
  const meters  = detectMeters();
  const hardware = detectHardware();
  const versions = [...new Set(servers.map(s => serverMeta[s]?.version).filter(Boolean))];
  const body = {
    customer:        currentCustomer,
    job_name:        get('ji-job-name', 'job_name') || currentCustomer,
    servers:         servers.join(', '),
    sensors:         active.length || null,
    meters:          meters.join(', '),
    o2:              detectO2Count() || null,
    server_version:  versions.join(', ') || null,
    hardware:        hardware !== '—' ? hardware : null,
    num_tech:        getNum('ji-num-tech', 'num_tech'),
    active:          1,
    estimated_days:  getNum('ji-estimated-days', 'estimated_days'),
    site_address:    get('ji-site-address', 'site_address'),
    offsites:        get('ji-offsites', 'offsites'),
    main_contact:    get('ji-main-contact', 'main_contact'),
    other_contacts:  get('ji-other-contacts', 'other_contacts'),
    contact_notes:   get('ji-contact-notes', 'contact_notes'),
    vpn_works:       get('ji-vpn', 'vpn_works'),
    airport_info:    get('ji-airport', 'airport_info'),
    emerald_aisle:   get('ji-emerald', 'emerald_aisle'),
    prev_hotel:      get('ji-hotel', 'prev_hotel'),
    hotel_comments:  get('ji-hotel-comments', 'hotel_comments'),
    restaurants:     get('ji-restaurants', 'restaurants'),
    report:          get('ji-report', 'report'),
    credentials:     get('ji-credentials', 'credentials'),
    comments:        get('ji-comments', 'comments'),
    other_notes:     get('ji-other', 'other_notes'),
    primary_tech:    get('ji-primary-tech', 'primary_tech'),
  };
  if (lastCalibrated) body.last_calibrated = lastCalibrated;

  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/jobinfo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': CONFIG.API_KEY,
        'X-Editor-Token': editorToken,
      },
      body: JSON.stringify(body),
    });
    console.log('Saved job info');
    if (!res.ok) throw new Error(await res.text());
    if (lastCalibrated) jobInfo.last_calibrated = lastCalibrated;
    const el = document.getElementById('ji-save-status');
    if (el) {
      el.textContent = `Saved ${new Date().toLocaleTimeString()}`;
      setTimeout(() => { if (el) el.textContent = ''; }, 3000);
    }
  } catch(e) {
    if (e.message.includes('Forbidden')) sessionStorage.removeItem('cal_editor_token');
    if (!silent) alert(e.message.includes('Forbidden')
      ? 'Incorrect editor password. Please try again.'
      : 'Failed to save job info');
    console.error(e);
  }
}

 // Helper: set input value only if element exists and value is non-null
  const setVal = (id, val) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (val === null || val === undefined || val === '') return;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    el.value = val;
  } else {
    el.textContent = val;
  }
};

function buildJobInfoTab() {
  const active   = allSensors.filter(s => s.status?.toUpperCase() === 'ENABLED');
  const meters   = detectMeters();
  const hardware = detectHardware();
  const warning  = getCustomerWarning();
  const versions = [...new Set(servers.map(s => serverMeta[s]?.version).filter(Boolean))];
  const o2count  = detectO2Count();

  // Warning banner
  const warnEl = document.getElementById('ji-warning');
  if (warnEl) {
    warnEl.textContent = warning || '';
    warnEl.style.display = warning ? 'block' : 'none';
  }

 

  // Auto-detected fields — always overwrite with fresh values
  setVal('ji-servers',        servers.join(', ') || '—');
  setVal('ji-sensor-count',   active.length);
  setVal('ji-hardware',       hardware !== '—' ? hardware : '');
  setVal('ji-server-version', versions.join(', '));
  setVal('ji-meters',         meters.join(', '));
  setVal('ji-o2',             o2count || 0);
  setVal('ji-customer-display', currentCustomer || '—');

  // Meter flags
  setVal('ji-re',  'TRUE');
  setVal('ji-hu',  meters.includes('HU')  ? 'TRUE' : 'FALSE');
  setVal('ji-co2', meters.includes('CO2') ? 'TRUE' : 'FALSE');
  setVal('ji-dp',  meters.includes('DP')  ? 'TRUE' : 'FALSE');

  // Manual / stored fields — populate from jobInfo
  setVal('ji-job-name',       jobInfo.job_name);
  setVal('ji-num-tech',       jobInfo.num_tech);
  setVal('ji-calendar-status', jobInfo.status);
  setVal('ji-estimated-days', jobInfo.estimated_days);
  const scheduleDates = jobInfo.scheduled_start_date
    ? (jobInfo.scheduled_start_date === jobInfo.scheduled_end_date
      ? jobInfo.scheduled_start_date
      : `${jobInfo.scheduled_start_date} – ${jobInfo.scheduled_end_date}`)
    : null;
  setVal('ji-scheduled-dates', scheduleDates);
  setVal('ji-scheduled-with-display', jobInfo.scheduled_with);
  setVal('ji-site-address',   jobInfo.site_address);
  setVal('ji-offsites',       jobInfo.offsites);
  setVal('ji-main-contact',   jobInfo.main_contact);
  setVal('ji-other-contacts', jobInfo.other_contacts);
  setVal('ji-contact-notes',  jobInfo.contact_notes);
  setVal('ji-vpn',            jobInfo.vpn_works);
  setVal('ji-airport',        jobInfo.airport_info);
  setVal('ji-emerald',        jobInfo.emerald_aisle);
  setVal('ji-hotel',          jobInfo.prev_hotel);
  setVal('ji-hotel-comments', jobInfo.hotel_comments);
  setVal('ji-restaurants',    jobInfo.restaurants);
  setVal('ji-report',         jobInfo.report);
  setVal('ji-credentials',    jobInfo.credentials);
  setVal('ji-comments',       jobInfo.comments);
  setVal('ji-other',          jobInfo.other_notes);
  setVal('ji-primary-tech',   jobInfo.primary_tech);
}

function buildJobInfoHTML() {
  const techOptions = CONFIG.TECHNICIANS
    .map(t => `<option value="${t}">${t}</option>`)
    .join('');

  const inp  = (id, placeholder='') =>
    `<input type="text" id="${id}" placeholder="${placeholder}" style="width:100%;"/>`;
  const num  = (id, placeholder='') =>
    `<input type="number" id="${id}" placeholder="${placeholder}" style="width:120px;" min="0"/>`;
  const ta   = (id, rows=2) =>
    `<textarea id="${id}" rows="${rows}" style="width:100%;"></textarea>`;
  const sel  = (id, options) =>
    `<select id="${id}" style="width:100%;">${options}</select>`;
  const dl   = (id, listId, options, placeholder='') =>
    `<input type="text" id="${id}" list="${listId}" placeholder="${placeholder}" style="width:100%;">
     <datalist id="${listId}">${options.map(o=>`<option value="${o}"></option>`).join('')}</datalist>`;

  // Section header helper
  const section = label =>
    `<tr><td colspan="2" style="padding:14px 12px 4px;font-size:12px;font-weight:600;
      color:var(--text-primary);text-transform:uppercase;letter-spacing:0.06em;
      border-bottom:0.5px solid var(--border);">${label}</td></tr>`;

  // Row helper: label + single input cell
  const row = (label, inputHtml, note='') =>
    `<tr>
      <td class="ji-label">${label}</td>
      <td class="ji-input">
        ${inputHtml}
        ${note ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${note}</div>` : ''}
      </td>
    </tr>`;

  // Read-only display row (for auto fields that shouldn't be edited)
  const roRow = (label, id, note='') =>
    `<tr>
      <td class="ji-label">${label}</td>
      <td class="ji-input">
        <span id="${id}" style="font-size:12px;color:var(--text-primary);">—</span>
        ${note ? `<span style="font-size:10px;color:var(--text-muted);margin-left:6px;">${note}</span>` : ''}
      </td>
    </tr>`;

  return `
    <div id="ji-warning" style="display:none;background:rgba(196,122,26,0.15);
      border:0.5px solid var(--accent-orange);border-radius:var(--radius-md);
      padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--accent-orange);"></div>

    <table class="ji-table">
      <thead><tr>
        <th style="width:180px;">Field</th>
        <th>Value</th>
      </tr></thead>
      <tbody>

        ${section('Identity')}
        ${roRow('Customer',      'ji-customer-display', 'Set in Servers panel')}
        ${row('Job name',        inp('ji-job-name'))}
        ${row('Primary tech',    sel('ji-primary-tech',
          `<option value="">Select...</option>${techOptions}`))}
        ${section('Scheduling')}
        ${roRow('Calendar status', 'ji-calendar-status', 'Managed from the calendar')}
        ${roRow('Scheduled dates', 'ji-scheduled-dates', 'Managed from the calendar')}
        ${roRow('Scheduled with', 'ji-scheduled-with-display', 'Managed from calendar assignments')}
        ${row('# Technicians',   num('ji-num-tech'))}
        ${row('Estimated days',  num('ji-estimated-days'))}

        ${section('Equipment — auto-detected from sensor data')}
        ${roRow('Servers',       'ji-servers')}
        ${roRow('Sensor count',  'ji-sensor-count')}
        ${roRow('Hardware',      'ji-hardware')}
        ${roRow('Server version','ji-server-version')}
        ${roRow('Meters needed', 'ji-meters')}
       <!-- ${roRow('RE',            'ji-re')} -->
      <!--${roRow('HU',            'ji-hu')} -->
       <!-- ${roRow('CO2',           'ji-co2')} -->
       <!-- ${roRow('DP',            'ji-dp')} -->
        ${row('O2 sensors',      num('ji-o2'), 'Auto-detected; override if needed')}

        ${section('Location')}
        ${row('Main site address', inp('ji-site-address'))}
        ${row('Offsites',          inp('ji-offsites'))}

        ${section('Travel')}
        ${row('VPN works?',      dl('ji-vpn',     'ji-vpn-dl',     ['Yes','No']))}
        ${row('Airport info',    inp('ji-airport'))}
        ${row('Emerald Aisle?',  dl('ji-emerald', 'ji-emerald-dl', ['Yes','No']))}
        ${row('Previous hotel',  inp('ji-hotel'))}
        ${row('Hotel comments',  ta('ji-hotel-comments'))}
        ${row('Restaurants & Attractions',     ta('ji-restaurants'))}

        ${section('Contacts')}
        ${row('Main contact',    inp('ji-main-contact',   'Name, phone, email'))}
        ${row('Other contacts',  ta('ji-other-contacts'))}
        ${row('Contact notes',   ta('ji-contact-notes'))}
        ${row('Credentials',     dl('ji-credentials', 'ji-cred-dl',
          ['None','Vendormate','Symplr','Green Security','IntelliCentrics']))}

        ${section('Documentation')}
        ${row('Comments',        ta('ji-comments', 3))}
        ${row('Report',          ta('ji-report',   3))}
        ${row('Other notes',     ta('ji-other',    2))}

      </tbody>
    </table>

    <div style="display:flex;gap:10px;align-items:center;padding:14px 9px 9px;">
      <button class="primary" onclick="saveJobInfo()">Save job info</button>
      <a href="jobs.html?job=${encodeURIComponent(currentCustomer || '')}" style="color:var(--accent-light-blue);font-size:12px;">Open full job record</a>
      <span id="ji-save-status" style="font-size:12px;color:var(--accent-green);"></span>
    </div>`;
}

//================================= END JOB INFO STUFF =====================================









// A targeted confetti function
function fireConfettiFromElement(elementSelector) {
  const element = document.querySelector(elementSelector);
  
  if (!element) {
    console.error(`Element ${elementSelector} not found.`);
    return;
  }

  // Get the element's exact size and position on the screen
  const rect = element.getBoundingClientRect();

  //Calculate the exact center of the element in pixels
  const xCenter = rect.left + (rect.width / 2);
  const yCenter = rect.top + (rect.height / 2);

  // Convert those pixels into percentages (0 to 1) for the confetti library
  const xRelative = (xCenter / window.innerWidth)-0.035; // Adjusted to fire slightly left of center
  const yRelative = yCenter / window.innerHeight;

  // Fire the confetti using the newly calculated relative coordinates
  confetti({
    particleCount: 150,
    spread: 40,
    origin: { x: xRelative, y: yRelative },
    zIndex: 9999,
    ticks: 400,
    colors: ['#5a9e2f', '#e8e8f0', '#2a2a38'] // Matching SVG colors
  });
}


// Image lightbox functionality =========================================
function setupImageLightboxes() {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image-content');
    const closeBtn = document.querySelector('.close-modal');
    
    // Find all images that we want to be clickable
    const thumbnails = document.querySelectorAll('.clickable-thumbnail');

    // 1. Open modal on thumbnail click
    thumbnails.forEach(img => {
        img.addEventListener('click', function() {
            modal.style.display = 'flex'; // Use flex to center the content
            
            // Set the full-res image source. 
            // If your thumbnails and high-res are the same file, just use this.src.
            // If you have separate high-res files, you could use a data attribute like this.dataset.highres
            modalImg.src = this.src; 
            modalImg.alt = this.alt;
        });
    });

    // 2. Close modal on the "X" click
    closeBtn.addEventListener('click', function() {
        modal.style.display = 'none';
        modalImg.src = ''; // Clear memory
    });

    // 3. Close modal if user clicks anywhere outside the image (on the dark background)
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
            modalImg.src = '';
        }
    });
}

//call this function after DOM has loaded
document.addEventListener('DOMContentLoaded', setupImageLightboxes);



/* ─── Init ──────────────────────────────────────────────── */
const serverInput = document.getElementById('server-input');

serverInput.addEventListener('keydown', e => { if (e.key === 'Enter') addServer(); });

// Listen for clicks on the datalist suggestions
serverInput.addEventListener('input', function() {
    // If the input contains " - ", it means they clicked a generated suggestion
    if (this.value.includes(' - ')) {
        addServer();
        this.value = ''; 
    }
});

document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

renderServerTags();
if (servers.length > 0) loadData();
else { showEmpty(true); renderMetrics(); }
