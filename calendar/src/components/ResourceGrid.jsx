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

// Build per-tech spans: tech -> evId -> { event, dates(sorted), startDate, endDate }
function buildSpans(events, assignments, dayStrs) {
  const raw = {};
  assignments.forEach(a => {
    if (!dayStrs.includes(a.date)) return;
    const ev = events.find(e => String(e.id) === String(a.event_id));
    if (!ev) return;
    if (!raw[a.tech_name]) raw[a.tech_name] = {};
    const key = String(ev.id);
    if (!raw[a.tech_name][key]) raw[a.tech_name][key] = { event: ev, dates: new Set() };
    raw[a.tech_name][key].dates.add(a.date);
  });
  const spans = {};
  Object.entries(raw).forEach(([tech, evMap]) => {
    spans[tech] = {};
    Object.entries(evMap).forEach(([evId, { event, dates }]) => {
      const sorted = [...dates].sort();
      spans[tech][evId] = { event, dates: sorted, startDate: sorted[0], endDate: sorted[sorted.length - 1] };
    });
  });
  return spans;
}

// For a cell (tech, ds): return all events that START on this day
// Each entry: { event, rowSpan (consecutive days from start), isOnlyEvent }
function getCellStarts(tech, ds, spans, dayStrs) {
  if (!spans[tech]) return [];
  return Object.values(spans[tech])
    .filter(s => s.startDate === ds)
    .map(s => {
      const startI = dayStrs.indexOf(ds);
      let rowSpan = 0;
      for (let i = startI; i < dayStrs.length; i++) {
        if (s.dates.includes(dayStrs[i])) rowSpan++;
        else break;
      }
      return { event: s.event, rowSpan, startDate: s.startDate };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// Build consumed map: cells covered by a rowSpan (only valid for single-event spans)
function buildConsumed(spans, dayStrs) {
  const c = {};
  CONFIG.TECHNICIANS.forEach(tech => {
    c[tech] = {};
    if (!spans[tech]) return;
    Object.values(spans[tech]).forEach(s => {
      // Only consume if this tech has EXACTLY one event starting on startDate
      const startingOnSameDay = Object.values(spans[tech])
        .filter(x => x.startDate === s.startDate).length;
      if (startingOnSameDay > 1) return; // multiple events: no rowSpan, don't consume

      const startI = dayStrs.indexOf(s.startDate);
      if (startI < 0) return;
      for (let i = startI + 1; i < dayStrs.length; i++) {
        if (!s.dates.includes(dayStrs[i])) break;
        c[tech][dayStrs[i]] = true;
      }
    });
  });
  return c;
}

export default function ResourceGrid({
  viewDate, events, assignments, techEvents,
  editorToken, requireEditor,
  onSaveEvent, onDeleteEvent,
  onSaveTechEvent, onDeleteTechEvent,
}) {
  const [modal,     setModal]     = useState(null);
  const [dragOver,  setDragOver]  = useState(null); // { tech, ds }
  const dragRef = useRef(null);

  const rangeStart = startOfWeek(subWeeks(viewDate, 2), { weekStartsOn: 1 });
  const rangeEnd   = endOfWeek(addWeeks(viewDate, 10),  { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const dayStrs    = useMemo(() => days.map(d => format(d, 'yyyy-MM-dd')), [days]);
  const today      = format(new Date(), 'yyyy-MM-dd');

  const spans   = useMemo(() => buildSpans(events, assignments, dayStrs),   [events, assignments, dayStrs]);
  const consumed = useMemo(() => buildConsumed(spans, dayStrs),             [spans, dayStrs]);

  const techEventMap = useMemo(() => {
    const m = {};
    techEvents.forEach(te => {
      if (!m[te.tech_name]) m[te.tech_name] = {};
      m[te.tech_name][te.date] = te;
    });
    return m;
  }, [techEvents]);

  const techBusyDates = useMemo(() => {
    const m = {};
    CONFIG.TECHNICIANS.forEach(t => { m[t] = new Set(); });
    assignments.forEach(a => { if (m[a.tech_name]) m[a.tech_name].add(a.date); });
    return m;
  }, [assignments]);

  /* ── Drag ───────────────────────────────────────────────── */
  function handleEventMouseDown(e, event, fromTech, fromDs) {
    if (!editorToken) return;
    e.stopPropagation();
    dragRef.current = {
      event, fromTech, fromDs,
      startX: e.clientX, startY: e.clientY, moved: false,
    };
    function onMove(me) {
      if (!dragRef.current) return;
      if (Math.abs(me.clientX - dragRef.current.startX) > 5 ||
          Math.abs(me.clientY - dragRef.current.startY) > 5)
        dragRef.current.moved = true;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragOver(null);
      if (!dragRef.current) return;
      const { moved, event, fromTech } = dragRef.current;
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

  function handleCellMouseEnter(tech, ds) {
    if (dragRef.current?.moved) setDragOver({ tech, ds });
  }

  function handleCellMouseUp(e, toTech, toDs) {
    setDragOver(null);
    if (!dragRef.current?.moved) return;
    const { event, fromTech, fromDs } = dragRef.current;

    const dateOffset  = differenceInCalendarDays(parseISO(toDs), parseISO(fromDs));
    const techChanged = toTech !== fromTech;

    // Get current assignments for this event
    const evAssignments = assignments.filter(a => String(a.event_id) === String(event.id));

    let newAssignments;

    if (!techChanged && dateOffset === 0) return; // nothing changed

    if (techChanged) {
      // Swap fromTech -> toTech, shift dates by offset, keep all other techs unchanged
      newAssignments = evAssignments.map(a => {
        if (a.tech_name === fromTech) {
          return {
            tech_name: toTech,
            date: format(addDays(parseISO(a.date), dateOffset), 'yyyy-MM-dd'),
          };
        }
        // Other techs: shift dates too if there's a date offset
        return {
          tech_name: a.tech_name,
          date: dateOffset !== 0
            ? format(addDays(parseISO(a.date), dateOffset), 'yyyy-MM-dd')
            : a.date,
        };
      });
    } else {
      // Same tech, just shift all dates
      newAssignments = evAssignments.map(a => ({
        tech_name: a.tech_name,
        date: format(addDays(parseISO(a.date), dateOffset), 'yyyy-MM-dd'),
      }));
    }

    const newStart = format(addDays(parseISO(event.start_date), dateOffset), 'yyyy-MM-dd');
    const newEnd   = format(addDays(parseISO(event.end_date),   dateOffset), 'yyyy-MM-dd');

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
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg,
                border: `1px solid ${c.border}`, display: 'inline-block' }}/>
              <span style={{ fontSize: 11, color: '#888899', textTransform: 'capitalize' }}>{s}</span>
            </div>
          ))}
          {['install','upgrade','pto'].map(t => {
            const c = CONFIG.TYPE_COLORS[t];
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg,
                  border: `1px solid ${c.border}`, display: 'inline-block' }}/>
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
                padding: '8px 10px', fontSize: 11, fontWeight: 500,
                color: '#555566', textAlign: 'left',
                borderBottom: '0.5px solid #2a2a35', borderRight: '0.5px solid #2a2a35',
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
                      }}>{format(d, 'MMMM yyyy')}</td>
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
                      const isDropTarget = dragOver?.tech === tech && dragOver?.ds === ds;

                      // Skip if covered by rowSpan above
                      if (consumed[tech]?.[ds]) return null;

                      const blocks = getCellStarts(tech, ds, spans, dayStrs);
                      const multipleBlocks = blocks.length > 1;

                      // Use rowSpan only for single-event cells
                      const rowSpan = !multipleBlocks && blocks.length === 1 && !techEv
                        ? blocks[0].rowSpan
                        : 1;

                      const cellH = rowSpan * ROW_H;

                      return (
                        <td key={tech}
                          rowSpan={rowSpan > 1 ? rowSpan : undefined}
                          onMouseEnter={() => handleCellMouseEnter(tech, ds)}
                          onMouseUp={e => handleCellMouseUp(e, tech, ds)}
                          onClick={() => {
                            if (!isBusy && !techEv) handleCellClick(tech, d);
                          }}
                          style={{
                            position: 'relative',
                            height: cellH,
                            borderBottom: '0.5px solid #1a1a1f',
                            borderRight: !isLast ? '0.5px solid #1a1a1f' : 'none',
                            cursor: editorToken && !isBusy && !techEv ? 'pointer' : 'default',
                            padding: '3px',
                            verticalAlign: 'top',
                            background: isDropTarget ? 'rgba(58,123,213,0.15)' : 'transparent',
                            outline: isDropTarget ? '1.5px dashed #3a7bd5' : 'none',
                            outlineOffset: -2,
                          }}>

                          {/* PTO / Holiday */}
                          {techEv && (
                            <div
                              onClick={e => { e.stopPropagation(); setModal({ type: 'tech', event: techEv }); }}
                              title={`${techEv.event_type}${techEv.notes ? ': ' + techEv.notes : ''}`}
                              style={{
                                height: cellH - 6, borderRadius: 4, cursor: 'pointer',
                                background: getTechEventColor(techEv).bg,
                                border: `0.5px solid ${getTechEventColor(techEv).border}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, color: getTechEventColor(techEv).fg,
                                fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                              }}>
                              {techEv.event_type.toUpperCase()}
                            </div>
                          )}

                          {/* Job blocks */}
                          {!techEv && blocks.map((b, bi) => {
                            const color  = getEventColor(b.event);
                            // For single block: fill the rowSpan height
                            // For multiple blocks: split evenly
                            const blockH = multipleBlocks
                              ? Math.floor((cellH - 6 - (blocks.length - 1) * 2) / blocks.length)
                              : cellH - 6;

                            return (
                              <div key={b.event.id}
                                onMouseDown={e => handleEventMouseDown(e, b.event, tech, ds)}
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