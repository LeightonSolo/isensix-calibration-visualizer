import { useState, useMemo } from 'react';
import { format, parseISO, isPast, isFuture, isToday } from 'date-fns';
import { CONFIG } from '../config';
import JobModal from './JobModal';
import TechEventModal from './TechEventModal';

function getEventColor(event) {
  if (event.event_type !== 'calibration') {
    return CONFIG.TYPE_COLORS[event.event_type] || CONFIG.TYPE_COLORS.other;
  }
  return CONFIG.STATUS_COLORS[event.status] || CONFIG.STATUS_COLORS.ticketed;
}

const S = {
  badge: (color) => ({
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    background: color.bg,
    color: color.fg,
    border: `0.5px solid ${color.border}`,
  }),
};

export default function JobList({
  events, assignments, techEvents,
  jobInfoMap, serverMeta,
  editorToken, requireEditor,
  onSaveEvent, onDeleteEvent,
  onSaveTechEvent, onSaveTechEventBatch, onDeleteTechEvent,
}) {
  const [modal,       setModal]       = useState(null);
  const [filter,      setFilter]      = useState('upcoming');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [search,      setSearch]      = useState('');
  const [sortCol,     setSortCol]     = useState('start_date');
  const [sortDir,     setSortDir]     = useState(1);
  const [view, setView] = useState('jobs'); // 'jobs' | 'techevents'

  // Build tech list per event
  const eventTechs = useMemo(() => {
    const map = {};
    assignments.forEach(a => {
      if (!map[a.event_id]) map[a.event_id] = new Set();
      map[a.event_id].add(a.tech_name);
    });
    return map;
  }, [assignments]);

  // Build full assignment list per event for modal
  const eventAssignments = useMemo(() => {
    const map = {};
    assignments.forEach(a => {
      if (!map[a.event_id]) map[a.event_id] = [];
      map[a.event_id].push(a);
    });
    return map;
  }, [assignments]);

  function sortBy(col) {
    if (sortCol === col) setSortDir(d => d * -1);
    else { setSortCol(col); setSortDir(1); }
  }

 const filtered = useMemo(() => {
  let rows = [...events];

  if (filter === 'upcoming') {
    rows = rows.filter(e => !isPast(parseISO(e.end_date)) || isToday(parseISO(e.end_date)));
  } else if (filter === 'past') {
    rows = rows.filter(e => isPast(parseISO(e.end_date)));
  }

  if (typeFilter) rows = rows.filter(e => e.event_type === typeFilter);

  // Tech filter — include job if selected tech has any assignment on it
  if (techFilter) {
    rows = rows.filter(e => {
      const techs = eventTechs[e.id];
      return techs && techs.has(techFilter);
    });
  }

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.customer || '').toLowerCase().includes(q) ||
      (e.ticket_id || '').toLowerCase().includes(q) ||
      (e.notes || '').toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
    if (av < bv) return -sortDir;
    if (av > bv) return  sortDir;
    return 0;
  });

  return rows;
}, [events, filter, typeFilter, techFilter, search, sortCol, sortDir]);

  function openEdit(event) {
    setModal({
      event: { ...event, assignments: eventAssignments[event.id] || [] }
    });
  }

  function thStyle(col) {
    return {
      padding: '7px 10px', fontSize: 12, fontWeight: 500,
      color: sortCol === col ? 'var(--cal-text)' : 'var(--cal-text-secondary)',
      textAlign: 'left', cursor: 'pointer', userSelect: 'none',
      borderBottom: '0.5px solid var(--cal-border)',
      background: 'var(--cal-header)', whiteSpace: 'nowrap',
    };
  }

  function thLabel(col, label) {
    const arrow = sortCol === col ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
    return label + arrow;
  }

  const inputStyle = {
    background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
    borderRadius: 4, color: 'var(--cal-text)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 9px', outline: 'none',
  };

  const tabStyle = (active) => ({
    background: active ? 'var(--cal-card)' : 'none',
    border: `0.5px solid ${active ? 'var(--cal-border-strong)' : 'var(--cal-border)'}`,
    borderRadius: 6, color: active ? 'var(--cal-text)' : 'var(--cal-text-secondary)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 13px', cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {modal && (
        <JobModal
          event={modal.event}
          calendarAssignments={assignments}
          techEvents={techEvents}
          jobInfoMap={jobInfoMap}
          serverMeta={serverMeta}
          onSave={(data) => requireEditor(token => onSaveEvent(data, token))}
          onDelete={(id) => requireEditor(token => onDeleteEvent(id, token))}
          onClose={() => setModal(null)}
        />
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button style={tabStyle(view === 'jobs')} onClick={() => setView('jobs')}>
          Jobs
        </button>
        <button style={tabStyle(view === 'techevents')} onClick={() => setView('techevents')}>
          PTO / Holidays / Other
        </button>
      </div>

      

      {/* Table */}
      {view === 'jobs' && (<>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={tabStyle(filter==='upcoming')} onClick={() => setFilter('upcoming')}>
          Upcoming
        </button>
        <button style={tabStyle(filter==='all')} onClick={() => setFilter('all')}>
          All
        </button>
        <button style={tabStyle(filter==='past')} onClick={() => setFilter('past')}>
          Past
        </button>
        <select style={{ ...inputStyle, marginLeft: 8 }}
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {CONFIG.EVENT_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
          ))}
        </select>
        <select style={inputStyle}
          value={techFilter} onChange={e => setTechFilter(e.target.value)}>
          <option value="">All techs</option>
          {CONFIG.TECHNICIANS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input style={{ ...inputStyle, width: 200 }}
          placeholder="Search title, customer, ticket…"
          value={search} onChange={e => setSearch(e.target.value)}/>
        <span style={{ fontSize: 12, color: 'var(--cal-text-muted)', marginLeft: 'auto' }}>
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
        {editorToken && (
          <button
            onClick={() => setModal({ event: null })}
            style={{
              background: 'var(--cal-accent)', border: '0.5px solid var(--cal-accent)',
              borderRadius: 4, color: '#fff', fontSize: 12,
              padding: '5px 12px', cursor: 'pointer',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
            + Add job
          </button>
        )}
      </div> 
      <div style={{ border: '0.5px solid var(--cal-border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={thStyle('start_date')} onClick={() => sortBy('start_date')}>
                  {thLabel('start_date', 'Dates')}
                </th>
                <th style={thStyle('title')} onClick={() => sortBy('title')}>
                  {thLabel('title', 'Job name')}
                </th>
                <th style={thStyle('event_type')} onClick={() => sortBy('event_type')}>
                  {thLabel('event_type', 'Type')}
                </th>
                <th style={thStyle('status')} onClick={() => sortBy('status')}>
                  {thLabel('status', 'Status')}
                </th>
                <th style={thStyle('ticket_id')} onClick={() => sortBy('ticket_id')}>
                  {thLabel('ticket_id', 'Ticket')}
                </th>
                <th style={thStyle('customer')} onClick={() => sortBy('customer')}>
                  {thLabel('customer', 'Customer')}
                </th>
                <th style={thStyle('_techs')}>Techs</th>
                <th style={thStyle('notes')} onClick={() => sortBy('notes')}>
                  {thLabel('notes', 'Notes')}
                </th>
                <th style={{ ...thStyle('_actions'), width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '2rem', textAlign: 'center',
                    color: 'var(--cal-text-muted)', fontSize: 13 }}>
                    No events found
                  </td>
                </tr>
              )}
              {filtered.map((event, i) => {
                const color  = getEventColor(event);
                const techs  = [...(eventTechs[event.id] || [])];
                const isOver = isPast(parseISO(event.end_date));
                return (
                  <tr key={event.id}
                    style={{ background: i % 2 === 0 ? 'var(--cal-panel)' : 'var(--cal-row-alt)' }}
                    onDoubleClick={() => openEdit(event)}>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: 'var(--cal-text)', whiteSpace: 'nowrap',
                      opacity: isOver ? 0.6 : 1 }}>
                      {event.start_date === event.end_date
                        ? format(parseISO(event.start_date), 'M/d/yy')
                        : `${format(parseISO(event.start_date), 'M/d')} – ${format(parseISO(event.end_date), 'M/d/yy')}`
                      }
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: 'var(--cal-text)', fontWeight: 500, maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={event.title}>
                      {event.title}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={S.badge(color)}>
                        {event.event_type}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={S.badge(CONFIG.STATUS_COLORS[event.status] || CONFIG.STATUS_COLORS.ticketed)}>
                        {event.status}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: 'var(--cal-text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {event.ticket_id || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: 'var(--cal-text-secondary)', maxWidth: 160,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {event.customer || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--cal-text-secondary)' }}>
                      {techs.length > 0 ? techs.join(', ') : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: 'var(--cal-text-muted)', maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={event.notes || ''}>
                      {event.notes || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      <button onClick={() => openEdit(event)}
                        style={{
                          background: 'none', border: '0.5px solid var(--cal-border)',
                          borderRadius: 4, color: 'var(--cal-text-secondary)', fontSize: 12,
                          padding: '3px 8px', cursor: 'pointer',
                          fontFamily: 'Inter, system-ui, sans-serif',
                        }}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div></>
      )}
      {view === 'techevents' && (
        <TechEventList
          techEvents={techEvents}
          editorToken={editorToken}
          requireEditor={requireEditor}
          onSaveTechEvent={onSaveTechEvent}
          onSaveTechEventBatch={onSaveTechEventBatch}
          onDeleteTechEvent={onDeleteTechEvent}
        />
      )}
    </div>
  );
}

function TechEventList({ techEvents, editorToken, requireEditor,
  onSaveTechEvent, onSaveTechEventBatch, onDeleteTechEvent }) {

  const [modal,      setModal]      = useState(null);
  const [filter,     setFilter]     = useState('upcoming');
  const [typeFilter, setTypeFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [sortCol,    setSortCol]    = useState('date');
  const [sortDir,    setSortDir]    = useState(1);

  const TYPE_LABELS = {
    pto: 'PTO', holiday: 'Holiday', jury_duty: 'Jury Duty',
    office: 'Office', other: 'Other',
  };

  function sortBy(col) {
    if (sortCol === col) setSortDir(d => d * -1);
    else { setSortCol(col); setSortDir(1); }
  }

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    let rows = [...techEvents];
    if (filter === 'upcoming') rows = rows.filter(e => e.date >= today);
    else if (filter === 'past') rows = rows.filter(e => e.date < today);
    if (typeFilter) rows = rows.filter(e => e.event_type === typeFilter);
    if (techFilter) rows = rows.filter(e => e.tech_name === techFilter);
    rows.sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
      if (av < bv) return -sortDir;
      if (av > bv) return  sortDir;
      return 0;
    });
    return rows;
  }, [techEvents, filter, typeFilter, techFilter, sortCol, sortDir, today]);

  const inputStyle = {
    background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
    borderRadius: 4, color: 'var(--cal-text)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 9px', outline: 'none',
  };

  const tabStyle = (active) => ({
    background: active ? 'var(--cal-card)' : 'none',
    border: `0.5px solid ${active ? 'var(--cal-border-strong)' : 'var(--cal-border)'}`,
    borderRadius: 6, color: active ? 'var(--cal-text)' : 'var(--cal-text-secondary)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 13px', cursor: 'pointer',
  });

  function thStyle(col) {
    return {
      padding: '7px 10px', fontSize: 12, fontWeight: 500,
      color: sortCol === col ? 'var(--cal-text)' : 'var(--cal-text-secondary)',
      textAlign: 'left', cursor: 'pointer', userSelect: 'none',
      borderBottom: '0.5px solid var(--cal-border)',
      background: 'var(--cal-header)', whiteSpace: 'nowrap',
    };
  }

  function thLabel(col, label) {
    return label + (sortCol === col ? (sortDir === 1 ? ' ↑' : ' ↓') : '');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {modal && (
        <TechEventModal
          techEvent={modal.event}
          onSave={(data) => requireEditor(token => onSaveTechEvent(data, token))}
          onSaveBatch={(entries) => requireEditor(token => onSaveTechEventBatch(entries, token))}
          onDelete={(id) => requireEditor(token => onDeleteTechEvent(id, token))}
          onClose={() => setModal(null)}
        />
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={tabStyle(filter==='upcoming')} onClick={() => setFilter('upcoming')}>Upcoming</button>
        <button style={tabStyle(filter==='all')}      onClick={() => setFilter('all')}>All</button>
        <button style={tabStyle(filter==='past')}     onClick={() => setFilter('past')}>Past</button>

        <select style={{ ...inputStyle, marginLeft: 8 }}
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {CONFIG.TECH_EVENT_TYPES.map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
          ))}
        </select>

        <select style={inputStyle}
          value={techFilter} onChange={e => setTechFilter(e.target.value)}>
          <option value="">All techs</option>
          {CONFIG.TECHNICIANS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <span style={{ fontSize: 12, color: 'var(--cal-text-muted)', marginLeft: 'auto' }}>
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>

        {editorToken && (
          <button onClick={() => setModal({ event: null })} style={{
            background: 'var(--cal-accent)', border: '0.5px solid var(--cal-accent)',
            borderRadius: 4, color: '#fff', fontSize: 12,
            padding: '5px 12px', cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>+ Add event</button>
        )}
      </div>

      {/* Table */}
      <div style={{ border: '0.5px solid var(--cal-border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={thStyle('tech_name')}   onClick={() => sortBy('tech_name')}>
                  {thLabel('tech_name', 'Tech')}
                </th>
                <th style={thStyle('event_type')}  onClick={() => sortBy('event_type')}>
                  {thLabel('event_type', 'Type')}
                </th>
                <th style={thStyle('date')}         onClick={() => sortBy('date')}>
                  {thLabel('date', 'Date')}
                </th>
                <th style={thStyle('notes')}        onClick={() => sortBy('notes')}>
                  {thLabel('notes', 'Notes')}
                </th>
                <th style={{ ...thStyle('_actions'), width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '2rem', textAlign: 'center',
                    color: 'var(--cal-text-muted)', fontSize: 13 }}>
                    No events found
                  </td>
                </tr>
              )}
              {filtered.map((te, i) => {
                const color = CONFIG.TYPE_COLORS[te.event_type] || CONFIG.TYPE_COLORS.other;
                const tc    = CONFIG.TECH_COLORS?.[te.tech_name];
                return (
                  <tr key={te.id}
                    style={{ background: i % 2 === 0 ? 'var(--cal-panel)' : 'var(--cal-row-alt)' }}
                    onDoubleClick={() => setModal({ event: te })}>
                    <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 500,
                      color: tc?.fg || 'var(--cal-text)' }}>
                      {te.tech_name}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px',
                        borderRadius: 4, fontSize: 12, fontWeight: 500,
                        background: color.bg, color: color.fg,
                        border: `0.5px solid ${color.border}`,
                        textTransform: 'capitalize',
                      }}>
                        {TYPE_LABELS[te.event_type] || te.event_type}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: te.date < today ? 'var(--cal-text-muted)' : 'var(--cal-text)',
                      fontFamily: 'JetBrains Mono, monospace' }}>
                      {te.date}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: 'var(--cal-text-muted)', maxWidth: 300,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {te.notes || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      <button onClick={() => setModal({ event: te })}
                        style={{
                          background: 'none', border: '0.5px solid var(--cal-border)',
                          borderRadius: 4, color: 'var(--cal-text-secondary)', fontSize: 12,
                          padding: '3px 8px', cursor: 'pointer',
                          fontFamily: 'Inter, system-ui, sans-serif',
                        }}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
