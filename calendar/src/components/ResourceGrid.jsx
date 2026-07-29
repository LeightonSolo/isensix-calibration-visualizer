import { useState, useMemo, useRef } from 'react';
import {
  format, eachDayOfInterval, startOfWeek, endOfWeek,
  addWeeks, subWeeks, isWeekend, parseISO,
  addDays, differenceInCalendarDays,
} from 'date-fns';
import { CONFIG } from '../config';
import JobModal from './JobModal';
import TechEventModal from './TechEventModal';

const CELL_W = 44;
const ROW_H  = 52;
const TECH_W = 90;

function getEventColor(event) {
  if (event.event_type !== 'calibration') {
    return CONFIG.TYPE_COLORS[event.event_type] || CONFIG.TYPE_COLORS.other;
  }
  return CONFIG.STATUS_COLORS[event.status] || CONFIG.STATUS_COLORS.ticketed;
}

function getTechEventColor(te) {
  return CONFIG.TYPE_COLORS[te.event_type] || CONFIG.TYPE_COLORS.other;
}

function buildTechDateMap(events, assignments) {
  const map = {};
  assignments.forEach(a => {
    const key = `${a.tech_name}||${a.date}`;
    if (!map[key]) map[key] = [];
    const ev = events.find(e => String(e.id) === String(a.event_id));
    if (ev) map[key].push(ev);
  });
  return map;
}

// For a given tech, compute all unique events assigned to them
// and find the date range they appear on
function getTechEventSpans(tech, events, assignments, days) {
  const dayStrs = days.map(d => format(d, 'yyyy-MM-dd'));
  const seen = new Map(); // event_id -> { event, dates: [] }

  assignments.forEach(a => {
    if (a.tech_name !== tech) return;
    if (!dayStrs.includes(a.date)) return;
    const ev = events.find(e => String(e.id) === String(a.event_id));
    if (!ev) return;
    if (!seen.has(String(ev.id))) seen.set(String(ev.id), { event: ev, dates: [] });
    seen.get(String(ev.id)).dates.push(a.date);
  });

  return [...seen.values()].map(({ event, dates }) => {
    const sorted = dates.sort();
    const startIdx = dayStrs.indexOf(sorted[0]);
    const endIdx   = dayStrs.indexOf(sorted[sorted.length - 1]);
    return { event, startIdx, endIdx, dates };
  });
}

export default function ResourceGrid({
  viewDate, events, assignments, techEvents,
  editorToken, requireEditor,
  onSaveEvent, onDeleteEvent,
  onSaveTechEvent, onDeleteTechEvent,
}) {
  const [modal, setModal] = useState(null);
  const dragRef = useRef(null);

  const rangeStart = startOfWeek(subWeeks(viewDate, 1), { weekStartsOn: 1 });
  const rangeEnd   = endOfWeek(addWeeks(viewDate, 9),   { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const today      = format(new Date(), 'yyyy-MM-dd');

  const techDateMap = useMemo(
    () => buildTechDateMap(events, assignments),
    [events, assignments]
  );

  const techEventMap = useMemo(() => {
    const m = {};
    techEvents.forEach(te => {
      if (!m[te.tech_name]) m[te.tech_name] = {};
      m[te.tech_name][te.date] = te;
    });
    return m;
  }, [techEvents]);

  const monthSpans = useMemo(() => {
    const spans = [];
    let cur = null;
    days.forEach((d, i) => {
      const m = format(d, 'yyyy-MM');
      if (m !== cur) {
        if (spans.length > 0) spans[spans.length - 1].count = i - spans[spans.length - 1].startIdx;
        spans.push({ label: format(d, 'MMMM yyyy'), startIdx: i, count: 0 });
        cur = m;
      }
    });
    if (spans.length) spans[spans.length - 1].count = days.length - spans[spans.length - 1].startIdx;
    return spans;
  }, [days]);

  function handleEventMouseDown(e, event, tech, ds) {
    if (!editorToken) return;
    e.stopPropagation();
    dragRef.current = { event, tech, ds, startX: e.clientX, startY: e.clientY, moved: false };
    function onMove(me) {
      if (!dragRef.current) return;
      if (Math.abs(me.clientX - dragRef.current.startX) > 6 ||
          Math.abs(me.clientY - dragRef.current.startY) > 6)
        dragRef.current.moved = true;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragRef.current) return;
      const { moved, event } = dragRef.current;
      dragRef.current = null;
      if (!moved) {
        const fullEvent = {
          ...event,
          assignments: assignments.filter(a => String(a.event_id) === String(event.id)),
        };
        setModal({ type: 'job', event: fullEvent });
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  async function handleCellMouseUp(e, ds) {
    if (!dragRef.current?.moved) return;
    const { event, ds: origDs } = dragRef.current;
    const offset = differenceInCalendarDays(parseISO(ds), parseISO(origDs));
    if (offset === 0) return;
    const newStart = format(addDays(parseISO(event.start_date), offset), 'yyyy-MM-dd');
    const newEnd   = format(addDays(parseISO(event.end_date),   offset), 'yyyy-MM-dd');
    const newAssignments = assignments
      .filter(a => String(a.event_id) === String(event.id))
      .map(a => ({
        tech_name: a.tech_name,
        date: format(addDays(parseISO(a.date), offset), 'yyyy-MM-dd'),
      }));
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
    <div>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
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
              <span style={{ width: 10, height: 10, borderRadius: 2,
                background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block' }}/>
              <span style={{ fontSize: 11, color: '#888899', textTransform: 'capitalize' }}>{s}</span>
            </div>
          ))}
          {['install','upgrade','pto'].map(t => {
            const c = CONFIG.TYPE_COLORS[t];
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2,
                  background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block' }}/>
                <span style={{ fontSize: 11, color: '#888899', textTransform: 'capitalize' }}>{t}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Single table — columns always aligned */}
      <div style={{
        overflowX: 'auto', overflowY: 'auto',
        maxHeight: 'calc(100vh - 100px)',
        border: '0.5px solid #2a2a35',
        borderRadius: 8,
      }}>
        <table style={{
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          width: TECH_W + days.length * CELL_W,
        }}>
          <colgroup>
            <col style={{ width: TECH_W }}/>
            {days.map(d => <col key={format(d,'yyyy-MM-dd')} style={{ width: CELL_W }}/>)}
          </colgroup>

          <thead style={{ position: 'sticky', top: 0, zIndex: 4 }}>
            {/* Month row */}
            <tr>
              <th style={{
                background: '#0e0e10', borderBottom: '0.5px solid #2a2a35',
                borderRight: '0.5px solid #2a2a35',
                position: 'sticky', left: 0, zIndex: 5,
              }}/>
              {monthSpans.map(span => (
                <th key={span.label} colSpan={span.count} style={{
                  padding: '4px 8px', fontSize: 10, fontWeight: 600,
                  color: '#888899', textAlign: 'left',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '0.5px solid #2a2a35',
                  borderLeft: '0.5px solid #2a2a35',
                  background: '#0e0e10',
                }}>{span.label}</th>
              ))}
            </tr>

            {/* Day row */}
            <tr>
              <th style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 500,
                color: '#555566', textAlign: 'left',
                borderBottom: '0.5px solid #2a2a35',
                borderRight: '0.5px solid #2a2a35',
                position: 'sticky', left: 0, zIndex: 5,
                background: '#111115',
              }}>Tech</th>
              {days.map(d => {
                const ds      = format(d, 'yyyy-MM-dd');
                const isToday = ds === today;
                const isWknd  = isWeekend(d);
                return (
                  <th key={ds} style={{
                    padding: '3px 2px', fontSize: 10, fontWeight: 400,
                    textAlign: 'center',
                    borderBottom: isToday ? '2px solid #5a9e2f' : '0.5px solid #2a2a35',
                    borderRight: '0.5px solid #1a1a1f',
                    background: isToday ? 'rgba(90,158,47,0.12)' : '#111115',
                    opacity: isWknd ? 0.4 : 1,
                  }}>
                    <div style={{ color: isToday ? '#7ec85a' : '#555566', fontWeight: isToday ? 700 : 400 }}>
                      {format(d, 'EEE')}
                    </div>
                    <div style={{ color: isToday ? '#7ec85a' : '#888899', fontWeight: isToday ? 700 : 400 }}>
                      {format(d, 'd')}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {CONFIG.TECHNICIANS.map((tech, ti) => {
              const spans = getTechEventSpans(tech, events, assignments, days);

              return (
                <tr key={tech} style={{ height: ROW_H }}>
                  {/* Sticky tech name */}
                  <td style={{
                    padding: '0 10px', fontSize: 12, fontWeight: 500,
                    color: '#e8e8f0',
                    borderBottom: ti < CONFIG.TECHNICIANS.length - 1 ? '0.5px solid #1a1a1f' : 'none',
                    borderRight: '0.5px solid #2a2a35',
                    position: 'sticky', left: 0, zIndex: 2,
                    background: '#111115', whiteSpace: 'nowrap',
                    height: ROW_H,
                  }}>{tech}</td>

                  {/* Single td spanning all days with absolute event blocks */}
                  <td colSpan={days.length} style={{
                    position: 'relative',
                    padding: 0,
                    height: ROW_H,
                    borderBottom: ti < CONFIG.TECHNICIANS.length - 1 ? '0.5px solid #1a1a1f' : 'none',
                  }}>
                    {/* Cell backgrounds — rendered as divs for today/weekend highlighting */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none' }}>
                      {days.map(d => {
                        const ds = format(d, 'yyyy-MM-dd');
                        return (
                          <div key={ds} style={{
                            width: CELL_W, flexShrink: 0,
                            background: ds === today ? 'rgba(90,158,47,0.06)'
                              : isWeekend(d) ? 'rgba(0,0,0,0.25)' : 'transparent',
                            borderRight: '0.5px solid #1a1a1f',
                            opacity: isWeekend(d) ? 0.5 : 1,
                          }}/>
                        );
                      })}
                    </div>

                    {/* Click targets per cell */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                      {days.map((d, di) => {
                        const ds     = format(d, 'yyyy-MM-dd');
                        const techEv = techEventMap[tech]?.[ds];
                        const hasCellEvent = spans.some(s => s.dates.includes(ds));
                        return (
                          <div key={ds}
                            style={{ width: CELL_W, flexShrink: 0, position: 'relative', height: ROW_H }}
                            onClick={() => {
                              if (!hasCellEvent && !techEv) handleCellClick(tech, d);
                            }}>
                            {techEv && (
                              <div onClick={e => { e.stopPropagation(); setModal({ type: 'tech', event: techEv }); }}
                                title={`${techEv.event_type}${techEv.notes ? ': ' + techEv.notes : ''}`}
                                style={{
                                  position: 'absolute', inset: '3px 1px',
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
                          </div>
                        );
                      })}
                    </div>

                    {/* Spanning event blocks */}
                    {spans.map(({ event, startIdx, endIdx }, si) => {
                      const color = getEventColor(event);
                      const left  = startIdx * CELL_W + 1;
                      const width = (endIdx - startIdx + 1) * CELL_W - 2;
                      const top   = 4 + (si % 2) * 22; // stack up to 2 events per row

                      return (
                        <div key={event.id}
                          onMouseDown={e => handleEventMouseDown(e, event, tech,
                            format(days[startIdx], 'yyyy-MM-dd'))}
                          title={`${event.title}${event.ticket_id ? ' #' + event.ticket_id : ''}${event.notes ? '\n' + event.notes : ''}`}
                          style={{
                            position: 'absolute',
                            left, top, width, height: 18,
                            borderRadius: 4,
                            background: color.bg,
                            border: `0.5px solid ${color.border}`,
                            display: 'flex', alignItems: 'center',
                            paddingLeft: 6, paddingRight: 4,
                            fontSize: 11, color: color.fg, fontWeight: 500,
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                            cursor: 'pointer', userSelect: 'none', zIndex: 1,
                          }}>
                          {event.title}
                          {event.ticket_id && (
                            <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 10 }}>
                              #{event.ticket_id}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!editorToken && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#555566', textAlign: 'center' }}>
          View only — click Editor login to make changes
        </div>
      )}
    </div>
  );
}
