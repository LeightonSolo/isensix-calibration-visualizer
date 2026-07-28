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
const ROW_H  = 34;
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
        maxHeight: 'calc(100vh - 180px)',
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
            {CONFIG.TECHNICIANS.map((tech, ti) => (
              <tr key={tech} style={{ height: ROW_H }}>
                <td style={{
                  padding: '0 10px', fontSize: 12, fontWeight: 500,
                  color: '#e8e8f0',
                  borderBottom: ti < CONFIG.TECHNICIANS.length - 1 ? '0.5px solid #1a1a1f' : 'none',
                  borderRight: '0.5px solid #2a2a35',
                  position: 'sticky', left: 0, zIndex: 2,
                  background: '#111115', whiteSpace: 'nowrap',
                }}>{tech}</td>

                {days.map(d => {
                  const ds         = format(d, 'yyyy-MM-dd');
                  const isToday    = ds === today;
                  const isWknd     = isWeekend(d);
                  const cellEvents = techDateMap[`${tech}||${ds}`] || [];
                  const techEv     = techEventMap[tech]?.[ds];

                  return (
                    <td key={ds}
                      onClick={() => {
                        if (cellEvents.length === 0 && !techEv) handleCellClick(tech, d);
                      }}
                      onMouseUp={e => handleCellMouseUp(e, ds)}
                      style={{
                        position: 'relative',
                        height: ROW_H,
                        borderBottom: ti < CONFIG.TECHNICIANS.length - 1
                          ? '0.5px solid #1a1a1f' : 'none',
                        borderRight: '0.5px solid #1a1a1f',
                        background: isToday
                          ? 'rgba(90,158,47,0.06)'
                          : isWknd ? 'rgba(0,0,0,0.25)' : 'transparent',
                        opacity: isWknd ? 0.5 : 1,
                        cursor: editorToken && cellEvents.length === 0 && !techEv ? 'pointer' : 'default',
                        padding: 0, verticalAlign: 'top',
                      }}>

                      {techEv && (
                        <div onClick={e => { e.stopPropagation(); setModal({ type: 'tech', event: techEv }); }}
                          title={`${techEv.event_type}${techEv.notes ? ': ' + techEv.notes : ''}`}
                          style={{
                            position: 'absolute', inset: '2px 1px', borderRadius: 3, cursor: 'pointer',
                            background: getTechEventColor(techEv).bg,
                            border: `0.5px solid ${getTechEventColor(techEv).border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, color: getTechEventColor(techEv).fg,
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                          {techEv.event_type.slice(0, 3)}
                        </div>
                      )}

                      {!techEv && cellEvents.slice(0, 2).map((ev, ei) => {
                        const color = getEventColor(ev);
                        return (
                          <div key={ev.id}
                            onMouseDown={e => handleEventMouseDown(e, ev, tech, ds)}
                            title={`${ev.title}${ev.ticket_id ? ' #' + ev.ticket_id : ''}${ev.notes ? '\n' + ev.notes : ''}`}
                            style={{
                              position: 'absolute',
                              top: 2 + ei * 15, left: 1, right: 1, height: 13,
                              borderRadius: 3,
                              background: color.bg,
                              border: `0.5px solid ${color.border}`,
                              display: 'flex', alignItems: 'center',
                              paddingLeft: 3, paddingRight: 2,
                              fontSize: 9, color: color.fg, fontWeight: 500,
                              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                              cursor: 'pointer', userSelect: 'none',
                            }}>
                            {ev.title}
                            {ev.ticket_id && (
                              <span style={{ marginLeft: 3, opacity: 0.6, fontSize: 8 }}>
                                #{ev.ticket_id}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {cellEvents.length > 2 && (
                        <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 8, color: '#555566' }}>
                          +{cellEvents.length - 2}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
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
