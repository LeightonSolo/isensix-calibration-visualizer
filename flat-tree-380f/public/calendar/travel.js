/* Adds shared hotel, rental-car, and flight details to the existing calendar job panel. */
(() => {
  'use strict';

  const API = 'https://flat-tree-380f.leightonsolo.workers.dev';
  const API_KEY = 'U87iy7VynFYLJUDnfUYBJHnRKbRiQO3Z';
  const SITE_KEY = 'cal_site_token';
  const KINDS = [
    { key: 'hotel', label: 'Hotel', icon: '🏨' },
    { key: 'car', label: 'Rental car', icon: '🚗' },
    { key: 'flight', label: 'Flights', icon: '✈' },
  ];
  let jobsPromise;

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const siteToken = () => {
    try { return sessionStorage.getItem(SITE_KEY) || ''; } catch (_) { return ''; }
  };

  const headers = (write = false) => {
    const result = { 'X-Api-Key': API_KEY };
    if (siteToken()) result['X-Editor-Token'] = siteToken();
    return result;
  };

  async function loadJobs() {
    if (!jobsPromise) {
      jobsPromise = fetch(`${API}/jobinfo/all`, { headers: headers() })
        .then(response => response.ok ? response.json() : [])
        .catch(() => []);
    }
    return jobsPromise;
  }

  async function findJob(panel) {
    const text = panel.textContent || '';
    const jobs = await loadJobs();
    return jobs
      .filter(job => job?.job_name && text.includes(job.job_name))
      .sort((a, b) => b.job_name.length - a.job_name.length)[0] || null;
  }

  function panelContent(panel) {
    return panel.children[2] || panel.querySelector('[style*="overflow-y"]');
  }

  function statusLabel(status) {
    return status === 'booked' ? 'Booked' : status === 'not_needed' ? 'Not needed' : 'Needs action';
  }

  function newItem(kind) {
    return { kind, technician: '', status: 'needed', details: '', notes: '' };
  }

  function groupedItems(items, kind) {
    const matches = items.filter(item => item.kind === kind);
    return matches.length ? matches : [newItem(kind)];
  }

  function renderReadOnly(items) {
    return KINDS.map(kind => {
      const rows = items.filter(item => item.kind === kind.key);
      return `<section class="travel-card">
        <div class="travel-card-heading"><strong>${kind.icon} ${kind.label}</strong><span>${rows.length ? rows.map(item => statusLabel(item.status)).join(' · ') : 'Not added'}</span></div>
        ${rows.length ? rows.map(item => `<div class="travel-item-readonly">
          ${item.technician ? `<b>${escapeHtml(item.technician)}</b>` : '<b>Shared</b>'}
          <span>${escapeHtml(item.details || 'No booking details')}</span>
          ${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}
        </div>`).join('') : '<div class="travel-empty">No travel information added.</div>'}
      </section>`;
    }).join('');
  }

  function renderEditor(items) {
    return KINDS.map(kind => `<section class="travel-card">
      <div class="travel-card-heading"><strong>${kind.icon} ${kind.label}</strong><button type="button" data-travel-add="${kind.key}">+ booking</button></div>
      <div class="travel-editor-list">
        ${groupedItems(items, kind.key).map((item, index) => `<div class="travel-item-editor" data-travel-kind="${kind.key}" data-travel-index="${index}">
          <div class="travel-editor-row">
            <input data-travel-field="technician" value="${escapeHtml(item.technician)}" placeholder="Technician or shared" aria-label="${kind.label} technician">
            <select data-travel-field="status" aria-label="${kind.label} status">
              ${['needed', 'booked', 'not_needed'].map(status => `<option value="${status}"${item.status === status ? ' selected' : ''}>${statusLabel(status)}</option>`).join('')}
            </select>
            <button type="button" class="travel-remove" data-travel-remove aria-label="Remove ${kind.label} booking">×</button>
          </div>
          <input data-travel-field="details" value="${escapeHtml(item.details)}" placeholder="Booking details">
          <textarea data-travel-field="notes" rows="2" placeholder="Optional notes">${escapeHtml(item.notes)}</textarea>
        </div>`).join('')}
      </div>
    </section>`).join('');
  }

  function addStyles() {
    if (document.getElementById('travel-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'travel-panel-styles';
    style.textContent = `
      .travel-panel-section { display:block; padding-bottom:18px; }
      .travel-panel-section[hidden] { display:none; }
      .travel-help { color:var(--cal-text-secondary); font-size:11px; line-height:1.4; margin:0 0 10px; }
      .travel-card { background:var(--cal-card); border:.5px solid var(--cal-border); border-radius:6px; margin:0 0 9px; padding:9px; }
      .travel-card-heading { align-items:center; color:var(--cal-text-secondary); display:flex; font-size:12px; justify-content:space-between; margin-bottom:7px; }
      .travel-card-heading strong { color:var(--cal-text); }
      .travel-card-heading button, .travel-save { background:var(--cal-input); border:.5px solid var(--cal-border-strong); border-radius:4px; color:var(--cal-text); cursor:pointer; font-size:11px; padding:3px 7px; }
      .travel-item-readonly { border-top:.5px solid var(--cal-border); display:grid; gap:2px; padding:6px 0 0; margin-top:6px; }
      .travel-item-readonly span, .travel-item-readonly small { color:var(--cal-text-secondary); font-size:11px; overflow-wrap:anywhere; }
      .travel-item-readonly small { color:var(--cal-text-muted); }
      .travel-empty { color:var(--cal-text-muted); font-size:11px; }
      .travel-item-editor { border-top:.5px solid var(--cal-border); display:grid; gap:6px; margin-top:7px; padding-top:7px; }
      .travel-editor-row { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:5px; }
      .travel-panel-section input, .travel-panel-section select, .travel-panel-section textarea { background:var(--cal-input); border:.5px solid var(--cal-border-strong); border-radius:4px; box-sizing:border-box; color:var(--cal-text); font:11px Inter,system-ui,sans-serif; padding:5px 6px; width:100%; }
      .travel-panel-section textarea { resize:vertical; }
      .travel-remove { background:transparent; border:0; color:var(--cal-text-muted); cursor:pointer; font-size:17px; line-height:1; padding:0 3px; }
      .travel-remove:hover { color:var(--cal-danger); }
      .travel-save-row { align-items:center; display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
      .travel-save { background:var(--cal-accent); border-color:var(--cal-accent); color:#fff; padding:5px 10px; }
      .travel-message { color:var(--cal-success); font-size:11px; margin-right:auto; }
      .travel-error { color:var(--cal-danger); }
    `;
    document.head.appendChild(style);
  }

  async function loadTravel(jobId) {
    const response = await fetch(`${API}/calendar/travel?job_info_id=${encodeURIComponent(jobId)}`, { headers: headers() });
    if (!response.ok) throw new Error('Could not load travel information.');
    return response.json();
  }

  async function openTravel(panel, button, job) {
    const content = panelContent(panel);
    if (!content || !job) return;
    const state = panel._travelState || (panel._travelState = { items: [], loaded: false });
    button.disabled = true;
    try {
      if (!state.loaded) {
        state.items = await loadTravel(job.id);
        state.loaded = true;
      }
      if (siteToken()) {
        KINDS.forEach(kind => {
          if (!state.items.some(item => item.kind === kind.key)) state.items.push(newItem(kind.key));
        });
      }
      content.querySelectorAll(':scope > *').forEach(child => { child.hidden = true; });
      let section = content.querySelector('.travel-panel-section');
      if (!section) {
        section = document.createElement('div');
        section.className = 'travel-panel-section';
        content.appendChild(section);
      }
      const editable = Boolean(siteToken());
      section.innerHTML = `<div class="travel-help">Shared travel details for this job. ${editable ? 'Optional notes can be added for solo or team travel.' : 'Editor access is required to make changes.'}</div>${editable ? renderEditor(state.items) : renderReadOnly(state.items)}${editable ? '<div class="travel-save-row"><span class="travel-message" data-travel-message></span><button type="button" class="travel-save" data-travel-save>Save travel</button></div>' : ''}`;
      section.hidden = false;
      section.onclick = event => {
        const add = event.target.closest('[data-travel-add]');
        if (add) {
          state.items.push(newItem(add.dataset.travelAdd));
          openTravel(panel, button, job);
          return;
        }
        const remove = event.target.closest('[data-travel-remove]');
        if (remove) {
          const editor = remove.closest('[data-travel-kind]');
          const kind = editor.dataset.travelKind;
          const index = Number(editor.dataset.travelIndex);
          const rows = groupedItems(state.items, kind);
          const item = rows[index];
          const actualIndex = state.items.indexOf(item);
          if (actualIndex >= 0) state.items.splice(actualIndex, 1);
          openTravel(panel, button, job);
          return;
        }
        if (event.target.closest('[data-travel-save]')) saveTravel(panel, section, job, state);
      };
      section.oninput = event => updateItemFromControl(state, event.target);
      section.onchange = event => updateItemFromControl(state, event.target);
    } catch (error) {
      button.title = error.message;
    } finally {
      button.disabled = false;
    }
  }

  function updateItemFromControl(state, control) {
    const editor = control.closest('[data-travel-kind]');
    if (!editor || !control.dataset.travelField) return;
    const rows = groupedItems(state.items, editor.dataset.travelKind);
    const item = rows[Number(editor.dataset.travelIndex)];
    if (item) item[control.dataset.travelField] = control.value;
  }

  async function saveTravel(panel, section, job, state) {
    const message = section.querySelector('[data-travel-message]');
    const items = state.items.filter(item => item.details || item.notes || item.technician || item.status !== 'needed');
    message.classList.remove('travel-error');
    message.textContent = 'Saving…';
    try {
      const response = await fetch(`${API}/calendar/travel`, {
        method: 'POST', headers: { ...headers(true), 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_info_id: job.id, items }),
      });
      if (!response.ok) throw new Error(response.status === 403 ? 'Editor access required.' : 'Could not save travel information.');
      state.items = items;
      message.textContent = 'Saved';
    } catch (error) {
      message.classList.add('travel-error');
      message.textContent = error.message;
    }
  }

  async function enhancePanel(panel) {
    if (!panel || panel._travelEnhancing) return;
    const job = await findJob(panel);
    if (!job) return;
    const tabs = panel.children[1];
    if (!tabs || tabs.querySelector('[data-travel-tab]')) return;
    panel._travelEnhancing = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.travelTab = 'true';
    button.textContent = 'Travel';
    button.style.cssText = 'background:none;border:.5px solid var(--cal-border);border-radius:5px;color:var(--cal-text-muted);font:12px Inter,system-ui,sans-serif;padding:4px 10px;cursor:pointer;';
    panel._travelJobId = job.id;
    button.addEventListener('click', async () => {
      const currentJob = await findJob(panel);
      if (!currentJob) return;
      if (panel._travelJobId !== currentJob.id) {
        panel._travelJobId = currentJob.id;
        panel._travelState = null;
      }
      openTravel(panel, button, currentJob);
    });
    tabs.appendChild(button);
    tabs.addEventListener('click', event => {
      if (event.target.closest('[data-travel-tab]')) return;
      const section = panel.querySelector('.travel-panel-section');
      if (section) section.remove();
      const content = panelContent(panel);
      content?.querySelectorAll(':scope > *').forEach(child => { child.hidden = false; });
      panel._travelState = null;
    });
  }

  function scan() {
    addStyles();
    document.querySelectorAll('.job-info-panel:not(.job-info-panel--empty)').forEach(panel => enhancePanel(panel));
  }

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
