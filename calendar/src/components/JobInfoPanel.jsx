import { useState, useEffect, useRef } from 'react';
import { CONFIG } from '../config';
import { format, parseISO } from 'date-fns';

const WORKER_URL = CONFIG.WORKER_URL;
const API_KEY    = CONFIG.API_KEY;

function Label({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--cal-text-muted)',
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
}) {
  const [fetchedJobInfo, setFetchedJobInfo] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState('summary');
  const [lastTitle, setLastTitle] = useState(null);
  const abortRef = useRef(null);
  const hasJobInfoOverride = jobInfoOverride !== undefined;
  const jobInfo = hasJobInfoOverride ? jobInfoOverride : fetchedJobInfo;

  useEffect(() => {
    if (hasJobInfoOverride) {
      setLoading(false);
      return;
    }
    if (!selectedEvent) { setFetchedJobInfo(null); setLastTitle(null); return; }
    const title = selectedEvent.title;
    if (title === lastTitle) return;

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
      .then(data => { setFetchedJobInfo(Object.keys(data).length ? data : null); setLoading(false); })
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

  const tabBtn = (t, label) => (
    <button onClick={() => setTab(t)} style={{
      background: tab === t ? 'var(--cal-surface-subtle)' : 'none',
      border: `0.5px solid ${tab === t ? 'var(--cal-border-active)' : 'var(--cal-border)'}`,
      borderRadius: 5, color: tab === t ? 'var(--cal-text)' : 'var(--cal-text-muted)',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11, padding: '4px 10px', cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div style={{
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
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cal-text)',
              lineHeight: 1.3, marginBottom: 4 }}>
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
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  color: statusColor.fg, letterSpacing: '0.04em',
                }}>
                  {selectedEvent.status || 'unconfirmed'}
                </span>
              )}
              {selectedEvent.isGhost && (
                <span style={{ fontSize: 10, color: 'var(--cal-warning)', fontStyle: 'italic' }}>
                  tentative
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      {selectedEvent && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px',
          borderBottom: '0.5px solid var(--cal-surface-subtle)', flexShrink: 0 }}>
          {tabBtn('summary', 'Summary')}
          {tabBtn('details', 'Full details')}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 20px' }}>
        {!selectedEvent && (
          <div style={{ marginTop: 20, fontSize: 11, color: 'var(--cal-text-quieter)',
            textAlign: 'center', lineHeight: 1.8 }}>
            {emptyMessage ? emptyMessage : <>
              Click the top right of a job to lock the panel.<br/>
              Hover to preview.
            </>}
          </div>
        )}

        {selectedEvent && loading && (
          <div style={{ fontSize: 11, color: 'var(--cal-text-faint)', marginTop: 16 }}>Loading…</div>
        )}

        {selectedEvent && !loading && tab === 'summary' && (
          <SummaryTab
            event={selectedEvent}
            jobInfo={jobInfo}
            techs={eventTechs}
            assignments={assignments}
            serverMeta={serverMeta}
          />
        )}

        {selectedEvent && !loading && tab === 'details' && (
          <DetailsTab jobInfo={jobInfo} event={selectedEvent} serverMeta={serverMeta} />
        )}
      </div>
    </div>
  );
}

function SummaryTab({ event, jobInfo, techs, assignments, serverMeta }) {
  const statusColor = CONFIG.STATUS_COLORS[event.status] || CONFIG.STATUS_COLORS.ticketed;

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
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500,
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

          {jobInfo.scheduled_start_date && (
            <>
              <Label>Job Info schedule</Label>
              <Value>{formatDateRange(jobInfo.scheduled_start_date, jobInfo.scheduled_end_date)}</Value>
            </>
          )}

          {jobInfo.scheduled_with && (
            <>
              <Label>Scheduled with</Label>
              <Value>{jobInfo.scheduled_with}</Value>
            </>
          )}

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
          <div style={{ fontSize: 11, color: 'var(--cal-text-faint)', fontStyle: 'italic' }}>
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

function DetailsTab({ jobInfo, event, serverMeta }) {
  if (!jobInfo) return (
    <div style={{ fontSize: 11, color: 'var(--cal-text-faint)', fontStyle: 'italic', marginTop: 16 }}>
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
      {row('Status',          jobInfo.status)}
      {row('Primary tech',    jobInfo.primary_tech)}
      {row('Scheduled with',  jobInfo.scheduled_with)}
      {row('Scheduled dates', formatDateRange(jobInfo.scheduled_start_date, jobInfo.scheduled_end_date))}
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
