/** Displays, edits, links, and exports the Job Info record associated with the selected calendar event. */
import { useState, useEffect, useRef } from 'react';
import { CONFIG } from '../config';
import { format, parseISO } from 'date-fns';
import { downloadOutlookCalendar } from '../utils/outlookExport.js';

const WORKER_URL = CONFIG.WORKER_URL;
const API_KEY    = CONFIG.API_KEY;

const EDIT_SECTIONS = [
  { title: 'Scheduling', fields: [
    { key: 'primary_tech', label: 'Primary tech', type: 'select', options: ['', ...CONFIG.TECHNICIANS] },
    { key: 'num_tech', label: '# technicians', type: 'number', min: 0 },
    { key: 'estimated_days', label: 'Estimated days', type: 'number', min: 1 },
  ]},
  { title: 'Location', fields: [
    { key: 'site_address', label: 'Main site address' },
    { key: 'offsites', label: 'Offsites', type: 'textarea' },
  ]},
  { title: 'Travel', fields: [
    { key: 'vpn_works', label: 'VPN works?', type: 'select', options: ['', 'Yes', 'No'] },
    { key: 'airport_info', label: 'Airport info' },
    { key: 'emerald_aisle', label: 'Emerald Aisle?', type: 'select', options: ['', 'Yes', 'No'] },
    { key: 'prev_hotel', label: 'Previous hotel' },
    { key: 'hotel_comments', label: 'Hotel comments', type: 'textarea' },
    { key: 'restaurants', label: 'Restaurants & attractions', type: 'textarea' },
  ]},
  { title: 'Contacts', fields: [
    { key: 'main_contact', label: 'Main contact' },
    { key: 'other_contacts', label: 'Other contacts', type: 'textarea' },
    { key: 'contact_notes', label: 'Contact notes', type: 'textarea' },
    { key: 'credentials', label: 'Credentials', type: 'select', options: ['', 'None', 'Vendormate', 'Symplr', 'Green Security', 'IntelliCentrics'] },
  ]},
  { title: 'Documentation', fields: [
    { key: 'comments', label: 'Comments', type: 'textarea' },
    { key: 'report', label: 'Report', type: 'textarea' },
    { key: 'other_notes', label: 'Other notes', type: 'textarea' },
  ]},
];

const NUMBER_FIELDS = new Set(['num_tech', 'estimated_days']);

function Label({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 600, color: 'var(--cal-text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      marginBottom: 3, marginTop: 10,
    }}>{children}</div>
  );
}

function Value({ children, muted }) {
  return (
    <div style={{
      fontSize: 12,
      color: muted ? 'var(--cal-text-muted)' : 'var(--cal-text)',
      lineHeight: 1.5,
    }}>{children || <span style={{ color: 'var(--cal-text-faint)' }}>—</span>}</div>
  );
}

function Divider() {
  return <div style={{ borderTop: '0.5px solid var(--cal-surface-subtle)', margin: '10px 0' }}/>;
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return null;
  try {
    if (!endDate || startDate === endDate) return format(parseISO(startDate), 'MMM d, yyyy');
    return `${format(parseISO(startDate), 'MMM d')} – ${format(parseISO(endDate), 'MMM d, yyyy')}`;
  } catch {
    return endDate && endDate !== startDate ? `${startDate} – ${endDate}` : startDate;
  }
}

function serverLink(sid, serverMeta) {
  // Use stored hostname if available, fallback to ics1.ca.isensix.com
  const meta = serverMeta?.[sid];
  const host = meta?.hostname || 'ics1.ca.isensix.com';
  //const host = 'ics1.ca.isensix.com';
  return `https://${host}:7${sid}`;
}

function linkifyText(text) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer"
        style={{ color: 'var(--cal-accent)', wordBreak: 'break-all' }}>
        {part}
      </a>
    ) : part
  );
}

export default function JobInfoPanel({
  selectedEvent,
  assignments,
  locked,
  serverMeta,
  jobInfoOverride,
  embedded = false,
  heading,
  emptyMessage,
  editorToken,
  requireEditor,
  onJobInfoSaved,
}) {
  const [fetchedJobInfo, setFetchedJobInfo] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState('summary');
  const [lastTitle, setLastTitle] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const abortRef = useRef(null);
  const hasJobInfoOverride = jobInfoOverride !== undefined;
  const jobInfo = hasJobInfoOverride ? jobInfoOverride : fetchedJobInfo;

  useEffect(() => {
    if (hasJobInfoOverride) {
      setLoading(false);
      return;
    }
    if (!selectedEvent) {
      setFetchedJobInfo(null);
      setLastTitle(null);
      setTab('summary');
      setDraft(null);
      return;
    }
    const title = selectedEvent.title;
    if (title === lastTitle) return;

    setTab('summary');
    setDraft(null);
    setSaveMessage('');

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLastTitle(title);

    fetch(`${WORKER_URL}/jobinfo/${encodeURIComponent(title)}`, {
      headers: { 'X-Api-Key': API_KEY },
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(data => {
        const nextJobInfo = Object.keys(data).length ? data : null;
        setFetchedJobInfo(nextJobInfo);
        setDraft(nextJobInfo ? { ...nextJobInfo } : null);
        setLoading(false);
      })
      .catch(e => { if (e.name !== 'AbortError') { setFetchedJobInfo(null); setLoading(false); } });

    return () => controller.abort();
  }, [selectedEvent?.title, hasJobInfoOverride]);

  // Tech assignments for this event
  const eventTechs = selectedEvent
    ? [...new Set(
        (assignments || [])
          .filter(a => String(a.event_id) === String(selectedEvent.id))
          .map(a => a.tech_name)
      )]
    : [];

  const statusColor = selectedEvent
    ? (CONFIG.STATUS_COLORS[selectedEvent.status] || CONFIG.STATUS_COLORS.ticketed)
    : null;

  function exportToOutlook() {
    if (!selectedEvent || selectedEvent.isGhost || embedded) return;
    const jobName = jobInfo?.job_name || selectedEvent.title;
    const jobInfoUrl = new URL(
      `../jobs.html?job=${encodeURIComponent(jobName)}`,
      window.location.href,
    ).href;
    downloadOutlookCalendar({ event: selectedEvent, jobInfo, assignments, jobInfoUrl });
  }

  function selectTab(nextTab) {
    if (nextTab === 'edit' && jobInfo) {
      setDraft({ ...jobInfo });
      setSaveMessage('');
    }
    setTab(nextTab);
  }

  const tabBtn = (t, label) => (
    <button onClick={() => selectTab(t)} style={{
      background: tab === t ? 'var(--cal-surface-subtle)' : 'none',
      border: `0.5px solid ${tab === t ? 'var(--cal-border-active)' : 'var(--cal-border)'}`,
      borderRadius: 5, color: tab === t ? 'var(--cal-text)' : 'var(--cal-text-muted)',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12, padding: '4px 10px', cursor: 'pointer',
    }}>{label}</button>
  );

  async function saveJobInfo(token) {
    if (!jobInfo || !draft || !selectedEvent) return;
    const updates = {};
    EDIT_SECTIONS.flatMap(section => section.fields).forEach(field => {
      const value = draft[field.key];
      if (NUMBER_FIELDS.has(field.key)) {
        updates[field.key] = value === '' || value === null || value === undefined
          ? null
          : Number(value);
      } else {
        updates[field.key] = value === '' || value === undefined ? null : value;
      }
    });
    const payload = { ...jobInfo, ...updates, job_name: jobInfo.job_name || selectedEvent.title };

    setSaving(true);
    setSaveMessage('');
    try {
      const response = await fetch(`${WORKER_URL}/jobinfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': API_KEY,
          'X-Editor-Token': token,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());

      const refreshedResponse = await fetch(
        `${WORKER_URL}/jobinfo/${encodeURIComponent(payload.job_name)}`,
        { headers: { 'X-Api-Key': API_KEY } }
      );
      if (!refreshedResponse.ok) throw new Error('Saved, but could not reload the job record.');
      const refreshed = await refreshedResponse.json();
      setFetchedJobInfo(refreshed);
      setDraft({ ...refreshed });
      onJobInfoSaved?.(refreshed);
      setSaveMessage('Saved');
      setTab('summary');
    } catch (error) {
      if (String(error.message).includes('Forbidden')) {
        sessionStorage.removeItem(CONFIG.EDITOR_TOKEN_KEY);
        setSaveMessage('Editor password was rejected. Lock and sign in again.');
      } else {
        setSaveMessage(error.message || 'Could not save job info.');
      }
    } finally {
      setSaving(false);
    }
  }

  function requestSave(event) {
    event.preventDefault();
    if (editorToken) saveJobInfo(editorToken);
    else requireEditor?.(saveJobInfo);
  }

  return (
    <div className={`job-info-panel${embedded ? ' job-info-panel--embedded' : ''}${!selectedEvent ? ' job-info-panel--empty' : ''}`} style={{
      width: embedded ? 340 : 320, flexShrink: 0,
      background: 'var(--cal-sidebar)',
      borderLeft: '0.5px solid var(--cal-border)',
      display: 'flex', flexDirection: 'column',
      height: embedded ? 'auto' : '100%', overflow: 'hidden',
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '0.5px solid var(--cal-border)',
        background: 'var(--cal-sidebar-header)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cal-text-heading-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          {heading || (locked ? '📌 Job info' : '👁 Job info')}
        </div>
        {!selectedEvent ? (
          <div style={{ fontSize: 13, color: 'var(--cal-text-faint)' }}>
            {emptyMessage || 'Hover or click a job to see details'}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cal-text)',
                lineHeight: 1.3, marginBottom: 4, overflowWrap: 'anywhere' }}>
                {selectedEvent.title}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selectedEvent.ticket_id && (
                  <span style={{ fontSize: 12, color: 'var(--cal-text-secondary)',
                    fontFamily: 'JetBrains Mono, monospace' }}>
                    #{selectedEvent.ticket_id}
                  </span>
                )}
                {statusColor && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                    color: statusColor.fg, letterSpacing: '0.04em',
                  }}>
                    {selectedEvent.status || 'unconfirmed'}
                  </span>
                )}
                {selectedEvent.isGhost && (
                  <span style={{ fontSize: 12, color: 'var(--cal-warning)', fontStyle: 'italic' }}>
                    tentative
                  </span>
                )}
              </div>
            </div>
            {((!embedded && !selectedEvent.isGhost) || jobInfo) && (
              <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column',
                alignItems: 'stretch', gap: 5, flexShrink: 0 }}>
                {!embedded && !selectedEvent.isGhost && (
                  <button type="button" onClick={exportToOutlook} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    border: '0.5px solid var(--cal-info-border)', borderRadius: 4,
                    background: 'var(--cal-info-bg)', color: 'var(--cal-accent)',
                    padding: '3px 7px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                  }} title="Download an Outlook-compatible calendar file">
                    <i className="ti ti-calendar-down" aria-hidden="true" /> Export
                  </button>
                )}
                {jobInfo && (
                  <a href={`../jobs.html?job=${encodeURIComponent(jobInfo.job_name || selectedEvent.title)}`}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      border: '0.5px solid var(--cal-info-border)', borderRadius: 4,
                      background: 'var(--cal-info-bg)', color: 'var(--cal-accent)',
                      padding: '3px 7px', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    <i className="ti ti-external-link" aria-hidden="true" /> Open Job Info
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      {selectedEvent && (
        <div style={{ display: 'flex', gap: 6, rowGap: 8, flexWrap: 'wrap', padding: '8px 14px',
          borderBottom: '0.5px solid var(--cal-surface-subtle)', flexShrink: 0 }}>
          {tabBtn('summary', 'Summary')}
          {tabBtn('details', 'Full details')}
          {jobInfo && requireEditor && tabBtn('edit', 'Edit')}
          {saveMessage && tab !== 'edit' && (
            <span style={{ alignSelf: 'center', color: saveMessage === 'Saved'
              ? 'var(--cal-success)' : 'var(--cal-warning)', fontSize: 12 }}>
              {saveMessage}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 20px' }}>
        {!selectedEvent && (
          <div style={{ marginTop: 20, fontSize: 14, color: 'var(--cal-text-quieter)',
            textAlign: 'center', lineHeight: 1.8 }}>
            {emptyMessage ? emptyMessage : <>
              Click the top right of a job to lock the panel.<br/>
              Hover to preview.
            </>}
          </div>
        )}

        {selectedEvent && loading && (
          <div style={{ fontSize: 12, color: 'var(--cal-text-faint)', marginTop: 16 }}>Loading…</div>
        )}

        {selectedEvent && !loading && tab === 'summary' && (
          <SummaryTab
            event={selectedEvent}
            jobInfo={jobInfo}
            techs={eventTechs}
            serverMeta={serverMeta}
          />
        )}

        {selectedEvent && !loading && tab === 'details' && (
          <DetailsTab jobInfo={jobInfo} event={selectedEvent} techs={eventTechs} serverMeta={serverMeta} />
        )}

        {selectedEvent && !loading && tab === 'edit' && jobInfo && draft && (
          <JobInfoEditForm
            draft={draft}
            setDraft={setDraft}
            saving={saving}
            saveMessage={saveMessage}
            onSave={requestSave}
            onCancel={() => { setDraft({ ...jobInfo }); setSaveMessage(''); setTab('summary'); }}
          />
        )}
      </div>
    </div>
  );
}

function JobInfoEditForm({ draft, setDraft, saving, saveMessage, onSave, onCancel }) {
  const controlStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--cal-input)', color: 'var(--cal-text)',
    border: '0.5px solid var(--cal-border-strong)', borderRadius: 5,
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12,
    lineHeight: 1.4, padding: '6px 8px', outline: 'none',
  };
  const setValue = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  return (
    <form onSubmit={onSave}>
      <div style={{ fontSize: 12, color: 'var(--cal-text-secondary)', marginBottom: 10 }}>
        Equipment and server fields remain managed by the CMS sync.
      </div>
      {EDIT_SECTIONS.map(section => (
        <div key={section.title} style={{ marginBottom: 14 }}>
          <Label>{section.title}</Label>
          <div style={{ display: 'grid', gap: 9 }}>
            {section.fields.map(field => {
              const value = draft[field.key] ?? '';
              return (
                <label key={field.key} style={{ display: 'grid', gap: 3,
                  color: 'var(--cal-text-secondary)', fontSize: 12 }}>
                  {field.label}
                  {field.type === 'textarea' ? (
                    <textarea value={value} rows={3} style={{ ...controlStyle, resize: 'vertical' }}
                      onChange={event => setValue(field.key, event.target.value)} />
                  ) : field.type === 'select' ? (
                    <select value={value} style={controlStyle}
                      onChange={event => setValue(field.key, event.target.value)}>
                      {field.options.map(option => (
                        <option key={option || 'blank'} value={option}>
                          {option || 'Select…'}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type={field.type || 'text'} value={value} min={field.min}
                      style={controlStyle}
                      onChange={event => setValue(field.key, event.target.value)} />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ position: 'sticky', bottom: -20, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 0 4px', background: 'var(--cal-sidebar)' }}>
        <button type="submit" disabled={saving} style={{
          background: 'var(--cal-accent)', color: '#fff',
          border: '0.5px solid var(--cal-accent)', borderRadius: 5,
          fontSize: 12, padding: '6px 12px', cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.65 : 1,
        }}>
          {saving ? 'Saving…' : 'Save job info'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} style={{
          background: 'var(--cal-input)', color: 'var(--cal-text)',
          border: '0.5px solid var(--cal-border)', borderRadius: 5,
          fontSize: 12, padding: '6px 12px', cursor: 'pointer',
        }}>
          Cancel
        </button>
        {saveMessage && (
          <span style={{ color: saveMessage === 'Saved' ? 'var(--cal-success)' : 'var(--cal-warning)',
            fontSize: 12 }}>
            {saveMessage}
          </span>
        )}
      </div>
    </form>
  );
}

function SummaryTab({ event, jobInfo, techs, serverMeta }) {
  return (
    <>
      {/* Dates */}
      <Label>Dates</Label>
      <Value>
        {event.start_date === event.end_date
          ? format(parseISO(event.start_date), 'MMM d, yyyy')
          : `${format(parseISO(event.start_date), 'MMM d')} – ${format(parseISO(event.end_date), 'MMM d, yyyy')}`
        }
      </Value>
      {jobInfo?.estimated_days && (
        <Value muted>Est. {jobInfo.estimated_days} day{jobInfo.estimated_days !== 1 ? 's' : ''}</Value>
      )}

      {/* Techs */}
      <Label>Assigned techs</Label>
      {techs.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {techs.map(t => {
            const tc = CONFIG.TECH_COLORS?.[t];
            return (
              <span key={t} style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500,
                background: tc?.bg || 'var(--cal-card)',
                color: tc?.fg || 'var(--cal-text)',
                border: `0.5px solid ${tc?.border || 'var(--cal-border)'}`,
              }}>{t}</span>
            );
          })}
        </div>
      ) : (
        <Value muted>No techs assigned</Value>
      )}

      {/* Job info quick fields */}
      {jobInfo && (
        <>
          <Divider/>

          {jobInfo.servers && (
            <>
              <Label>Servers</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {jobInfo.servers.split(',').map(s => s.trim()).filter(Boolean).map(sid => (
                  <a key={sid} href={serverLink(sid, serverMeta)}
                    target="_blank" rel="noreferrer"
                    style={{ color: 'var(--cal-accent)', fontSize: 12, textDecoration: 'none',
                      padding: '1px 6px', borderRadius: 3,
                      border: '0.5px solid var(--cal-info-border)', background: 'var(--cal-info-bg)' }}>
                    {sid}
                  </a>
                ))}
              </div>
            </>
          )}

          {jobInfo.num_tech && (
            <>
              <Label>Techs needed</Label>
              <Value>{jobInfo.num_tech}</Value>
            </>
          )}

          {jobInfo.primary_tech && (
            <>
              <Label>Primary tech</Label>
              <Value>{jobInfo.primary_tech}</Value>
            </>
          )}

          {jobInfo.sensors && (
            <>
              <Label>Sensor count</Label>
              <Value>{jobInfo.sensors} sensors · {jobInfo.hardware || '—'}</Value>
            </>
          )}

          {jobInfo.meters && (
            <>
              <Label>Meters needed</Label>
              <Value>
                {jobInfo.meters}
                {jobInfo.o2 > 0 && (
                  <>
                    {' · '}
                    <span style={{ color: 'red' }}>O2 ×{jobInfo.o2}</span>
                  </>
                )}
              </Value>
            </>
          )}

          {jobInfo.site_address && (
            <>
              <Label>Location</Label>
              <Value>{jobInfo.site_address}</Value>
              {jobInfo.offsites && <div style={{ fontSize: 12, color: 'var(--cal-text)', lineHeight: 1.6 }}>
                {linkifyText(jobInfo.offsites)}
              </div>}
            </>
          )}

          {jobInfo.main_contact && (
            <>
              <Label>Main contact</Label>
              <Value>{jobInfo.main_contact}</Value>
            </>
          )}

          {jobInfo.other_contacts && (
            <>
              <Label>Other contacts</Label>
              <Value>{jobInfo.other_contacts}</Value>
            </>
          )}

          {jobInfo.comments && (
            <>
              <Label>Comments</Label>
              <Value>{jobInfo.comments}</Value>
            </>
          )}

          {jobInfo.credentials && (
            <>
              <Label>Credentials</Label>
              <Value>{jobInfo.credentials}</Value>
            </>
          )}

          {jobInfo.server_version && (
            <>
              <Label>Server version(s)</Label>
              <Value>{jobInfo.server_version}</Value>
            </>
          )}

          {jobInfo.hardware && (
            <>
              <Label>Hardware</Label>
              <Value>{jobInfo.hardware}</Value>
            </>
          )}

        </>
      )}

      {!jobInfo && (
        <>
          <Divider/>
          <div style={{ fontSize: 12, color: 'var(--cal-text-faint)', fontStyle: 'italic' }}>
            No job info found for "{event.title}"
          </div>
        </>
      )}

      {event.notes && (
        <>
          <Divider/>
          <Label>Event notes</Label>
          <Value>{event.notes}</Value>
        </>
      )}
    </>
  );
}

function DetailsTab({ jobInfo, event, techs, serverMeta }) {
  if (!jobInfo) return (
    <div style={{ fontSize: 12, color: 'var(--cal-text-faint)', fontStyle: 'italic', marginTop: 16 }}>
      No job info found for "{event.title}".<br/><br/>
      Add it from the Job Info tab on the dashboard.
    </div>
  );

  const row = (label, val) => val ? (
    <><Label>{label}</Label><Value>{val}</Value></>
  ) : null;

  return (
    <>
      {row('Customer',        jobInfo.customer)}
      {row('Job name',        jobInfo.job_name)}
      {row('Calendar status', event.status)}
      {row('Primary tech',    jobInfo.primary_tech)}
      {row('Scheduled with',  techs?.join(', '))}
      {row('Scheduled dates', formatDateRange(event.start_date, event.end_date))}
      {row('Est. days',       jobInfo.estimated_days)}

      <Divider/>
      {row('Servers',         jobInfo.servers && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {jobInfo.servers.split(',').map(s => s.trim()).filter(Boolean).map(sid => (
                  <a key={sid} href={serverLink(sid, serverMeta)}
                    target="_blank" rel="noreferrer"
                    style={{ color: 'var(--cal-accent)', fontSize: 12, textDecoration: 'none',
                      padding: '1px 6px', borderRadius: 3,
                      border: '0.5px solid var(--cal-info-border)', background: 'var(--cal-info-bg)' }}>
                    {sid}
                  </a>
                ))}
              </div>
            </>
          ))}
      {row('Sensor count',    jobInfo.sensors)}
      {row('Hardware',        jobInfo.hardware)}
      {row('Server version',  jobInfo.server_version)}
      {row('Meters',          jobInfo.meters)}
      {jobInfo.o2 ? <><Label>O2 sensors</Label><Value>{jobInfo.o2}</Value></> : null}

      <Divider/>
      {row('Site address',    jobInfo.site_address)}
      {row('Offsites',        <div style={{ fontSize: 12, color: 'var(--cal-text)', lineHeight: 1.6 }}>
        {linkifyText(jobInfo.offsites)}
      </div>)}

      <Divider/>
      {row('Main contact',    jobInfo.main_contact)}
      {row('Other contacts',  jobInfo.other_contacts)}
      {row('Contact notes',   jobInfo.contact_notes)}
      {row('Credentials',     jobInfo.credentials)}

      <Divider/>
      {row('VPN works',       jobInfo.vpn_works)}
      {row('Airport',         jobInfo.airport_info)}
      {row('Emerald Aisle',   jobInfo.emerald_aisle)}
      {row('Hotel',           jobInfo.prev_hotel)}
      {row('Hotel comments',  jobInfo.hotel_comments)}
      {row('Restaurants',     jobInfo.restaurants)}

      <Divider/>
      {row('Comments',        jobInfo.comments)}
      {row('Report',          jobInfo.report)}
      {row('Other notes',     jobInfo.other_notes)}
    </>
  );
}
