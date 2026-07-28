import { useState, useMemo } from 'react';
import { format, parseISO, isPast, isFuture, isToday } from 'date-fns';
import { CONFIG } from '../config';
import JobModal from './JobModal';

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
    fontSize: 11,
    fontWeight: 500,
    background: color.bg,
    color: color.fg,
    border: `0.5px solid ${color.border}`,
  }),
};

export default function JobList({
  events, assignments, editorToken, requireEditor,
  onSaveEvent, onDeleteEvent,
}) {
  const [modal,       setModal]       = useState(null);
  const [filter,      setFilter]      = useState('upcoming');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [search,      setSearch]      = useState('');
  const [sortCol,     setSortCol]     = useState('start_date');
  const [sortDir,     setSortDir]     = useState(1);

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

    // Time filter
    if (filter === 'upcoming') {
      rows = rows.filter(e => !isPast(parseISO(e.end_date)) || isToday(parseISO(e.end_date)));
    } else if (filter === 'past') {
      rows = rows.filter(e => isPast(parseISO(e.end_date)));
    }

    // Type filter
    if (typeFilter) rows = rows.filter(e => e.event_type === typeFilter);

    // Search
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(e =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.customer || '').toLowerCase().includes(q) ||
        (e.ticket_id || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q)
      );
    }

    // Sort
    rows.sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
      if (av < bv) return -sortDir;
      if (av > bv) return  sortDir;
      return 0;
    });

    return rows;
  }, [events, filter, typeFilter, search, sortCol, sortDir]);

  function openEdit(event) {
    setModal({
      event: { ...event, assignments: eventAssignments[event.id] || [] }
    });
  }

  function thStyle(col) {
    return {
      padding: '7px 10px', fontSize: 11, fontWeight: 500,
      color: sortCol === col ? '#e8e8f0' : '#888899',
      textAlign: 'left', cursor: 'pointer', userSelect: 'none',
      borderBottom: '0.5px solid #2a2a35',
      background: '#111115', whiteSpace: 'nowrap',
    };
  }

  function thLabel(col, label) {
    const arrow = sortCol === col ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
    return label + arrow;
  }

  const inputStyle = {
    background: '#1e1e24', border: '0.5px solid #2a2a35',
    borderRadius: 4, color: '#e8e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 9px', outline: 'none',
  };

  const tabStyle = (active) => ({
    background: active ? '#1a1a22' : 'none',
    border: `0.5px solid ${active ? '#3a3a50' : '#2a2a35'}`,
    borderRadius: 6, color: active ? '#e8e8f0' : '#888899',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 13px', cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {modal && (
        <JobModal
          event={modal.event}
          onSave={(data) => requireEditor(token => onSaveEvent(data, token))}
          onDelete={(id) => requireEditor(token => onDeleteEvent(id, token))}
          onClose={() => setModal(null)}
        />
      )}

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
        <input style={{ ...inputStyle, width: 200 }}
          placeholder="Search title, customer, ticket…"
          value={search} onChange={e => setSearch(e.target.value)}/>
        <span style={{ fontSize: 11, color: '#555566', marginLeft: 'auto' }}>
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
        {editorToken && (
          <button
            onClick={() => setModal({ event: null })}
            style={{
              background: '#3a7bd5', border: '0.5px solid #3a7bd5',
              borderRadius: 4, color: '#fff', fontSize: 12,
              padding: '5px 12px', cursor: 'pointer',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
            + Add job
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ border: '0.5px solid #2a2a35', borderRadius: 8, overflow: 'hidden' }}>
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
                    color: '#555566', fontSize: 13 }}>
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
                    style={{ background: i % 2 === 0 ? '#16161a' : '#1a1a1f' }}
                    onDoubleClick={() => openEdit(event)}>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: '#e8e8f0', whiteSpace: 'nowrap',
                      opacity: isOver ? 0.6 : 1 }}>
                      {event.start_date === event.end_date
                        ? format(parseISO(event.start_date), 'M/d/yy')
                        : `${format(parseISO(event.start_date), 'M/d')} – ${format(parseISO(event.end_date), 'M/d/yy')}`
                      }
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: '#e8e8f0', fontWeight: 500, maxWidth: 200,
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
                      color: '#888899', fontFamily: 'JetBrains Mono, monospace' }}>
                      {event.ticket_id || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12,
                      color: '#888899', maxWidth: 160,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {event.customer || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 11, color: '#888899' }}>
                      {techs.length > 0 ? techs.join(', ') : '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 11,
                      color: '#555566', maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={event.notes || ''}>
                      {event.notes || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      <button onClick={() => openEdit(event)}
                        style={{
                          background: 'none', border: '0.5px solid #2a2a35',
                          borderRadius: 4, color: '#888899', fontSize: 11,
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
