import { useState, useMemo, useRef } from 'react';
import {
  format, eachDayOfInterval, startOfWeek, endOfWeek,
  addWeeks, subWeeks, isWeekend, parseISO, addDays,
  differenceInCalendarDays,
} from 'date-fns';
import { CONFIG } from '../config';
import JobModal from './JobModal';
import TechEventModal from './TechEventModal';

const COL_W  = 130;
const ROW_H  = 36;
const DATE_W = 72;

function getEventColor(ev) {
  if (ev.event_type !== 'calibration')
    return CONFIG.TYPE_COLORS[ev.event_type] || CONFIG.TYPE_COLORS.other;
  return CONFIG.STATUS_COLORS[ev.status] || CONFIG.STATUS_COLORS.ticketed;
}
function getTechEventColor(te) {
  return CONFIG.TYPE_COLORS[te.event_type] || CONFIG.TYPE_COLORS.other;
}

// Build: techName -> eventId -> sorted array of dateStrings (only within visible days)
function buildSpans(events, assignments, dayStrs) {
  const map = {}; // tech -> evId -> Set<date>
  assignments.forEach(a => {
    if (!dayStrs.includes(a.date)) return;
    if (!map[a.tech_name]) map[a.tech_name] = {};
    const key = String(a.event_id);
    if (!map[a.tech_name][key]) map[a.tech_name][key] = new Set();
    map[a.tech_name][key].add(a.date);
  });

  // tech -> evId -> { event, dates (sorted), startDate, endDate }
  const spans = {};
  Object.entries(map).forEach(([tech, evMap]) => {
    spans[tech] = {};
    Object.entries(evMap).forEach(([evId, dates]) => {
      const ev = events.find(e => String(e.id) === evId);
      if (!ev) return;
      const sorted = [...dates].sort();
      spans[tech][evId] = { event: ev, dates: sorted, startDate: sorted[0], endDate: sorted[sorted.length - 1] };
    });
  });
  return spans;
}

// For a given tech + date: which events start here, continue here, or are absent
// Returns array of { event, rowSpan, isStart } sorted by startDate
function getCellBlocks(tech, ds, spans, dayStrs) {
  if (!spans[tech]) return [];
  const di = dayStrs.indexOf(ds);

  return Object.values(spans[tech])
    .filter(s => s.dates.includes(ds))
    .map(s => {
      const startI = dayStrs.indexOf(s.startDate);
      // rowSpan = number of consecutive days from startDate within visible window
      let span = 0;
      for (let i = startI; i < dayStrs.length; i++) {
        if (s.dates.includes(dayStrs[i])) span++;
        else break;
      }
      return { event: s.event, rowSpan: span, isStart: s.startDate === ds, startI };
    })
    .filter(b => b.isStart) // only render at start — rowSpan handles the rest
    .sort((a, b) => a.startI - b.startI);
}

export default function ResourceGrid({
  viewDate, events, assignments, techEvents,
  editorToken, requireEditor,
  onSaveEvent, onDeleteEvent,
  onSaveTechEvent, onDeleteTechEvent,
}) {
  const [modal, setModal] = useState(null);
  const dragRef = useRef(null);

  const rangeStart = startOfWeek(subWeeks(viewDate, 2), { weekStartsOn: 1 });
  const rangeEnd   = endOfWeek(addWeeks(viewDate, 10),  { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const dayStrs    = useMemo(() => days.map(d => format(d, 'yyyy-MM-dd')), [days]);
  const today      = format(new Date(), 'yyyy-MM-dd');

  const spans = useMemo(
    () => buildSpans(events, assignments, dayStrs),
    [events, assignments, dayStrs]
  );

  const techEventMap = useMemo(() => {
    const m = {};
    techEvents.forEach(te => {
      if (!m[te.tech_name]) m[te.tech_name] = {};
      m[te.tech_name][te.date] = te;
    });
    return m;
  }, [techEvents]);

  // Set of dates that have any assignment, per tech (for click suppression)
  const techBusyDates = useMemo(() => {
    const m = {};
    CONFIG.TECHNICIANS.forEach(t => { m[t] = new Set(); });
    assignments.forEach(a => { if (m[a.tech_name]) m[a.tech_name].add(a.date); });
    return m;
  }, [assignments]);

  // Precompute which cells are "consumed" by a rowSpan above them
  // consumed[tech][ds] = true means this cell is covered by a span above
  const consumed = useMemo(() => {
    const c = {};
    CONFIG.TECHNICIANS.forEach(tech => {
      c[tech] = {};
      if (!spans[tech]) return;
      Object.values(spans[tech]).forEach(s => {
        const startI = dayStrs.indexOf(s.startDate);
        if (startI < 0) return;
        // mark days 1..span-1 as consumed (day 0 is the start cell itself)
        for (let i = startI + 1; i < dayStrs.length; i++) {
          if (!s.dates.includes(dayStrs[i])) break;
          c[tech][dayStrs[i]] = true;
        }
      });
    });
    return c;
  }, [spans, dayStrs]);

  /* ── Drag to move ──────────────────────────────────────── */
  function handleEventMouseDown(e, event, origDs) {
    if (!editorToken) return;
    e.stopPropagation();
    dragRef.current = { event, origDs, startX: e.clientX, startY: e.clientY, moved: false };

    function onMove(me) {
      if (!dragRef.current) return;
      if (Math.abs(me.clientX - dragRef.current.startX) > 5 ||
          Math.abs(me.clientY - dragRef.current.startY) > 5)
        dragRef.current.moved = true;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragRef.current) return;
      const { moved, event } = dragRef.current;
      dragRef.current = null;
      if (!moved) {
        setModal({
          type: 'job',
          event: { ...event, assignments: assignments.filter(a => String(a.event_id) === String(event.id)) },
        });
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleCellMouseUp(e, ds) {
    if (!dragRef.current?.moved) return;
    const { event, origDs } = dragRef.current;
    const offset = differenceInCalendarDays(parseISO(ds), parseISO(origDs));
    if (offset === 0) return;
    const newStart = format(addDays(parseISO(event.start_date), offset), 'yyyy-MM-dd');
    const newEnd   = format(addDays(parseISO(event.end_date),   offset), 'yyyy-MM-dd');
    const newAssignments = assignments
      .filter(a => String(a.event_id) === String(event.id))
      .map(a => ({ tech_name: a.tech_name, date: format(addDays(parseISO(a.date), offset), 'yyyy-MM-dd') }));
    requireEditor(async token => {
      await onSaveEvent({ ...event, start_date: newStart, end_date: newEnd, assignments: newAssignments }, token);
    });
  }

  function handleCellClick(tech, d) {
    if (!editorToken) return;
    const ds = format(d, 'yyyy-MM-dd');
    const te = techEventMap[tech]?.[ds];
    if (te) { setModal({ type: 'tech', event: te }); return; }
    setModal({ type: 'job', event: null, initialDate: d, initialTech: tech });
  }

  const btnStyle = (primary) => ({
    background: primary ? '#3a7bd5' : '#1e1e24',
    border: `0.5px solid ${primary ? '#3a7bd5' : '#2a2a35'}`,
    borderRadius: 4, color: primary ? '#fff' : '#e8e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 12px', cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>

      {modal?.type === 'job' && (
        <JobModal
          event={modal.event}
          initialDate={modal.initialDate}
          onSave={(data) => requireEditor(token => onSaveEvent(data, token))}
          onDelete={(id) => requireEditor(token => onDeleteEvent(id, token))}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'tech' && (
        <TechEventModal
          techEvent={modal.event}
          initialDate={modal.initialDate}
          initialTech={modal.tech}
          onSave={(data) => requireEditor(token => onSaveTechEvent(data, token))}
          onDelete={(id) => requireEditor(token => onDeleteTechEvent(id, token))}
          onClose={() => setModal(null)}
        />
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexShrink: 0 }}>
        {editorToken && (
          <>
            <button style={btnStyle(true)}
              onClick={() => setModal({ type: 'job', event: null, initialDate: new Date() })}>
              + Add job
            </button>
            <button style={btnStyle(false)}
              onClick={() => setModal({ type: 'tech', event: null, initialDate: new Date() })}>
              + PTO / Holiday
            </button>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {Object.entries(CONFIG.STATUS_COLORS).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block' }}/>
              <span style={{ fontSize: 11, color: '#888899', textTransform: 'capitalize' }}>{s}</span>
            </div>
          ))}
          {['install','upgrade','pto'].map(t => {
            const c = CONFIG.TYPE_COLORS[t];
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block' }}/>
                <span style={{ fontSize: 11, color: '#888899', textTransform: 'capitalize' }}>{t}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', border: '0.5px solid #2a2a35', borderRadius: 8 }}>
        <table style={{
          borderCollapse: 'collapse', tableLayout: 'fixed',
          width: DATE_W + CONFIG.TECHNICIANS.length * COL_W,
          minWidth: '100%',
        }}>
          <colgroup>
            <col style={{ width: DATE_W }}/>
            {CONFIG.TECHNICIANS.map(t => <col key={t} style={{ width: COL_W }}/>)}
          </colgroup>

          <thead style={{ position: 'sticky', top: 0, zIndex: 4 }}>
            <tr style={{ background: '#111115' }}>
              <th style={{
                padding: '8px 10px', fontSize: 11, fontWeight: 500, color: '#555566',
                textAlign: 'left', borderBottom: '0.5px solid #2a2a35',
                borderRight: '0.5px solid #2a2a35',
                position: 'sticky', left: 0, zIndex: 5, background: '#111115',
              }}>Date</th>
              {CONFIG.TECHNICIANS.map((tech, i) => (
                <th key={tech} style={{
                  padding: '8px 10px', fontSize: 13, fontWeight: 600,
                  color: '#e8e8f0', textAlign: 'center',
                  borderBottom: '0.5px solid #2a2a35',
                  borderRight: i < CONFIG.TECHNICIANS.length - 1 ? '0.5px solid #2a2a35' : 'none',
                  background: '#111115', letterSpacing: '-0.01em',
                }}>{tech}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {days.map((d, di) => {
              const ds      = format(d, 'yyyy-MM-dd');
              const isToday = ds === today;
              const isWknd  = isWeekend(d);
              const isFirst = di === 0 || format(days[di-1], 'MM') !== format(d, 'MM');

              return (
                <>
                  {isFirst && (
                    <tr key={`month-${ds}`}>
                      <td colSpan={CONFIG.TECHNICIANS.length + 1} style={{
                        padding: '5px 10px', fontSize: 10, fontWeight: 700,
                        color: '#555566', textTransform: 'uppercase',
                        letterSpacing: '0.08em', background: '#0a0a0c',
                        borderBottom: '0.5px solid #2a2a35',
                        borderTop: di > 0 ? '0.5px solid #2a2a35' : 'none',
                      }}>
                        {format(d, 'MMMM yyyy')}
                      </td>
                    </tr>
                  )}

                  <tr key={ds} style={{
                    height: ROW_H,
                    background: isToday ? 'rgba(90,158,47,0.06)'
                      : isWknd ? 'rgba(0,0,0,0.2)' : 'transparent',
                    opacity: isWknd ? 0.65 : 1,
                  }}>
                    {/* Date label */}
                    <td style={{
                      padding: '0 8px', fontSize: 11,
                      color: isToday ? '#7ec85a' : isWknd ? '#444455' : '#888899',
                      fontWeight: isToday ? 700 : 400,
                      borderBottom: '0.5px solid #1a1a1f',
                      borderRight: '0.5px solid #2a2a35',
                      position: 'sticky', left: 0, zIndex: 2,
                      background: isToday ? '#0d1a0d' : isWknd ? '#0a0a0c' : '#0e0e10',
                      whiteSpace: 'nowrap', verticalAlign: 'middle',
                    }}>
                      <span style={{ fontWeight: 600 }}>{format(d, 'EEE')} </span>
                      <span style={{ fontSize: 10 }}>{format(d, 'M/d')}</span>
                    </td>

                    {/* Tech cells */}
                    {CONFIG.TECHNICIANS.map((tech, ti) => {
                      const isLast  = ti === CONFIG.TECHNICIANS.length - 1;
                      const techEv  = techEventMap[tech]?.[ds];
                      const isBusy  = techBusyDates[tech]?.has(ds);

                      // Skip cells that are covered by a rowSpan above
                      if (consumed[tech]?.[ds]) return null;

                      // Get blocks that start on this cell
                      const blocks = getCellBlocks(tech, ds, spans, dayStrs);

                      // Determine rowSpan for this cell:
                      // if there's exactly one block spanning multiple rows, use that
                      // otherwise rowSpan = 1
                      const maxSpan = blocks.length === 1 ? blocks[0].rowSpan : 1;

                      return (
                        <td key={tech}
                          rowSpan={maxSpan > 1 ? maxSpan : undefined}
                          onMouseUp={e => handleCellMouseUp(e, ds)}
                          onClick={() => {
                            if (!isBusy && !techEv) handleCellClick(tech, d);
                          }}
                          style={{
                            position: 'relative',
                            height: maxSpan > 1 ? ROW_H * maxSpan : ROW_H,
                            borderBottom: '0.5px solid #1a1a1f',
                            borderRight: !isLast ? '0.5px solid #1a1a1f' : 'none',
                            cursor: editorToken && !isBusy && !techEv ? 'pointer' : 'default',
                            padding: '3px',
                            verticalAlign: 'top',
                          }}>

                          {/* PTO / Holiday */}
                          {techEv && (
                            <div
                              onClick={e => { e.stopPropagation(); setModal({ type: 'tech', event: techEv }); }}
                              title={`${techEv.event_type}${techEv.notes ? ': ' + techEv.notes : ''}`}
                              style={{
                                height: '100%', minHeight: ROW_H - 6,
                                borderRadius: 4, cursor: 'pointer',
                                background: getTechEventColor(techEv).bg,
                                border: `0.5px solid ${getTechEventColor(techEv).border}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, color: getTechEventColor(techEv).fg,
                                fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                              }}>
                              {techEv.event_type.toUpperCase()}
                            </div>
                          )}

                          {/* Job event blocks */}
                          {!techEv && blocks.map((b, bi) => {
                            const color    = getEventColor(b.event);
                            const cellH    = (b.rowSpan * ROW_H) - (b.rowSpan * 6);
                            const blockH   = blocks.length > 1
                              ? Math.floor(cellH / blocks.length) - 2
                              : cellH;

                            return (
                              <div key={b.event.id}
                                onMouseDown={e => handleEventMouseDown(e, b.event, ds)}
                                title={`${b.event.title}${b.event.ticket_id ? ' #' + b.event.ticket_id : ''}${b.event.notes ? '\n' + b.event.notes : ''}`}
                                style={{
                                  height: blockH,
                                  marginBottom: bi < blocks.length - 1 ? 2 : 0,
                                  borderRadius: 4,
                                  background: color.bg,
                                  border: `0.5px solid ${color.border}`,
                                  borderLeft: `3px solid ${color.fg}`,
                                  display: 'flex', alignItems: 'center',
                                  paddingLeft: 6, paddingRight: 4,
                                  fontSize: 11, color: color.fg, fontWeight: 500,
                                  overflow: 'hidden', whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  cursor: editorToken ? 'grab' : 'pointer',
                                  userSelect: 'none',
                                }}>
                                {b.event.title}
                                {b.event.ticket_id && (
                                  <span style={{ marginLeft: 4, opacity: 0.55, fontSize: 9 }}>
                                    #{b.event.ticket_id}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {!editorToken && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#555566', textAlign: 'center', flexShrink: 0 }}>
          View only — click Editor login to make changes
        </div>
      )}
    </div>
  );
}