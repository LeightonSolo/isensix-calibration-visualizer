import { useState, useEffect, useRef } from 'react';
import { CONFIG } from '../config';
import { format, parseISO } from 'date-fns';

const WORKER_URL = CONFIG.WORKER_URL;
const API_KEY    = CONFIG.API_KEY;

function Label({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: '#555566',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      marginBottom: 3, marginTop: 10,
    }}>{children}</div>
  );
}

function Value({ children, muted }) {
  return (
    <div style={{
      fontSize: 12,
      color: muted ? '#555566' : '#e8e8f0',
      lineHeight: 1.5,
    }}>{children || <span style={{ color: '#333344' }}>—</span>}</div>
  );
}

function Divider() {
  return <div style={{ borderTop: '0.5px solid #1a1a28', margin: '10px 0' }}/>;
}

export default function JobInfoPanel({ selectedEvent, assignments, locked }) {
  const [jobInfo,  setJobInfo]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState('summary');
  const [lastTitle, setLastTitle] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!selectedEvent) { setJobInfo(null); setLastTitle(null); return; }
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
      .then(data => { setJobInfo(Object.keys(data).length ? data : null); setLoading(false); })
      .catch(e => { if (e.name !== 'AbortError') { setJobInfo(null); setLoading(false); } });

    return () => controller.abort();
  }, [selectedEvent?.title]);

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
      background: tab === t ? '#1a1a28' : 'none',
      border: `0.5px solid ${tab === t ? '#3a3a55' : '#2a2a35'}`,
      borderRadius: 5, color: tab === t ? '#e8e8f0' : '#555566',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11, padding: '4px 10px', cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div style={{
      width: 280, flexShrink: 0,
      background: '#12121a',
      borderLeft: '0.5px solid #2a2a35',
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '0.5px solid #2a2a35',
        background: '#0e0e15',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#555566',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          {locked ? '📌 Job info' : '👁 Job info'}
        </div>
        {!selectedEvent ? (
          <div style={{ fontSize: 11, color: '#333344' }}>
            Hover or click a job to see details
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8f0',
              lineHeight: 1.3, marginBottom: 4 }}>
              {selectedEvent.title}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {selectedEvent.ticket_id && (
                <span style={{ fontSize: 10, color: '#888899',
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
                <span style={{ fontSize: 10, color: '#c47a1a', fontStyle: 'italic' }}>
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
          borderBottom: '0.5px solid #1a1a28', flexShrink: 0 }}>
          {tabBtn('summary', 'Summary')}
          {tabBtn('details', 'Full details')}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 20px' }}>
        {!selectedEvent && (
          <div style={{ marginTop: 20, fontSize: 11, color: '#2a2a38',
            textAlign: 'center', lineHeight: 1.8 }}>
            Click a job to lock the panel.<br/>
            Hover to preview.
          </div>
        )}

        {selectedEvent && loading && (
          <div style={{ fontSize: 11, color: '#333344', marginTop: 16 }}>Loading…</div>
        )}

        {selectedEvent && !loading && tab === 'summary' && (
          <SummaryTab
            event={selectedEvent}
            jobInfo={jobInfo}
            techs={eventTechs}
            assignments={assignments}
          />
        )}

        {selectedEvent && !loading && tab === 'details' && (
          <DetailsTab jobInfo={jobInfo} event={selectedEvent} />
        )}
      </div>
    </div>
  );
}

function SummaryTab({ event, jobInfo, techs, assignments }) {
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
                background: tc?.bg || '#1a1a22',
                color: tc?.fg || '#e8e8f0',
                border: `0.5px solid ${tc?.border || '#2a2a35'}`,
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

          {jobInfo.num_tech && (
            <>
              <Label>Techs needed</Label>
              <Value>{jobInfo.num_tech}</Value>
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
              <Value>{jobInfo.meters}{jobInfo.o2 ? ` · O2 ×${jobInfo.o2}` : ''}</Value>
            </>
          )}

          {jobInfo.site_address && (
            <>
              <Label>Location</Label>
              <Value>{jobInfo.site_address}</Value>
              {jobInfo.offsites && <Value muted>{jobInfo.offsites}</Value>}
            </>
          )}

          {jobInfo.main_contact && (
            <>
              <Label>Main contact</Label>
              <Value>{jobInfo.main_contact}</Value>
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

          {jobInfo.vpn_works && (
            <>
              <Label>VPN</Label>
              <Value>{jobInfo.vpn_works}</Value>
            </>
          )}
        </>
      )}

      {!jobInfo && (
        <>
          <Divider/>
          <div style={{ fontSize: 11, color: '#333344', fontStyle: 'italic' }}>
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

function DetailsTab({ jobInfo, event }) {
  if (!jobInfo) return (
    <div style={{ fontSize: 11, color: '#333344', fontStyle: 'italic', marginTop: 16 }}>
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
      {row('Scheduled date',  jobInfo.scheduled_date)}
      {row('Est. days',       jobInfo.estimated_days)}

      <Divider/>
      {row('Servers',         jobInfo.servers)}
      {row('Sensor count',    jobInfo.sensors)}
      {row('Hardware',        jobInfo.hardware)}
      {row('Server version',  jobInfo.server_version)}
      {row('Meters',          jobInfo.meters)}
      {jobInfo.o2 ? <><Label>O2 sensors</Label><Value>{jobInfo.o2}</Value></> : null}

      <Divider/>
      {row('Site address',    jobInfo.site_address)}
      {row('Offsites',        jobInfo.offsites)}

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