import { useState, useMemo, useRef } from 'react';
import {
  format, eachDayOfInterval, startOfWeek, endOfWeek,
  addWeeks, subWeeks, isWeekend, parseISO,
  addDays, differenceInCalendarDays, isSameMonth,
} from 'date-fns';
import { CONFIG } from '../config';
import JobModal from './JobModal';
import TechEventModal from './TechEventModal';

const COL_W  = 130;  // px per tech column
const ROW_H  = 36;   // px per date row
const DATE_W = 72;   // date label column width

function getEventColor(event) {
  if (event.event_type !== 'calibration') {
    return CONFIG.TYPE_COLORS[event.event_type] || CONFIG.TYPE_COLORS.other;
  }
  return CONFIG.STATUS_COLORS[event.status] || CONFIG.STATUS_COLORS.ticketed;
}

function getTechEventColor(te) {
  return CONFIG.TYPE_COLORS[te.event_type] || CONFIG.TYPE_COLORS.other;
}

// For each tech, build a map of dateStr -> [events]
function buildAssignmentMap(events, assignments) {
  const map = {}; // `${tech}||${date}` -> [event]
  assignments.forEach(a => {
    const ev = events.find(e => String(e.id) === String(a.event_id));
    if (!ev) return;
    const key = `${a.tech_name}||${a.date}`;
    if (!map[key]) map[key] = [];
    if (!map[key].find(e => e.id === ev.id)) map[key].push(ev);
  });
  return map;
}

// For a tech on a given date, find if this is the FIRST day of an event
// and how many consecutive days it runs (for visual grouping label)
function getEventStartInfo(tech, dateStr, events, assignments, days) {
  const dayStrs = days.map(d => format(d, 'yyyy-MM-dd'));
  const results = [];

  // Find all events assigned to this tech on this date
  const todayAssignments = assignments.filter(
    a => a.tech_name === tech && a.date === dateStr
  );

  todayAssignments.forEach(a => {
    const ev = events.find(e => String(e.id) === String(a.event_id));
    if (!ev) return;

    // Check if this tech was also assigned yesterday
    const di = dayStrs.indexOf(dateStr);
    const prevDs = di > 0 ? dayStrs[di - 1] : null;
    const wasYesterday = prevDs && assignments.some(
      x => x.tech_name === tech && String(x.event_id) === String(ev.id) && x.date === prevDs
    );

    // Count how many consecutive days from today
    let span = 0;
    for (let i = di; i < dayStrs.length; i++) {
      const assigned = assignments.some(
        x => x.tech_name === tech && String(x.event_id) === String(ev.id) && x.date === dayStrs[i]
      );
      if (assigned) span++;
      else break;
    }

    results.push({ event: ev, isStart: !wasYesterday, span });
  });

  return results;
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
  const today      = format(new Date(), 'yyyy-MM-dd');

  const assignMap = useMemo(
    () => buildAssignmentMap(events, assignments),
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

  // Which dates have any assignment per tech
  const techBusyDates = useMemo(() => {
    const m = {};
    CONFIG.TECHNICIANS.forEach(t => { m[t] = new Set(); });
    assignments.forEach(a => {
      if (m[a.tech_name]) m[a.tech_name].add(a.date);
    });
    return m;
  }, [assignments]);

  // Precompute per-cell event info
  const cellInfo = useMemo(() => {
    const m = {};
    days.forEach(d => {
      const ds = format(d, 'yyyy-MM-dd');
      CONFIG.TECHNICIANS.forEach(tech => {
        m[`${tech}||${ds}`] = getEventStartInfo(tech, ds, events, assignments, days);
      });
    });
    return m;
  }, [days, events, assignments]);

  function handleEventClick(event) {
    setModal({
      type: 'job',
      event: { ...event, assignments: assignments.filter(a => String(a.event_id) === String(event.id)) },
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

  // Group days by month for month labels
  const months = useMemo(() => {
    const m = [];
    let cur = null;
    days.forEach((d, i) => {
      const mk = format(d, 'yyyy-MM');
      if (mk !== cur) {
        m.push({ label: format(d, 'MMMM yyyy'), startIdx: i });
        if (m.length > 1) m[m.length-2].count = i - m[m.length-2].startIdx;
        cur = mk;
      }
    });
    if (m.length) m[m.length-1].count = days.length - m[m.length-1].startIdx;
    return m;
  }, [days]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      {/* Modal */}
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
      <div style={{
        flex: 1, overflow: 'auto',
        border: '0.5px solid #2a2a35', borderRadius: 8,
      }}>
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
            {/* Tech name row */}
            <tr style={{ background: '#111115' }}>
              <th style={{
                padding: '6px 10px', fontSize: 11, fontWeight: 500,
                color: '#555566', textAlign: 'left',
                borderBottom: '0.5px solid #2a2a35',
                borderRight: '0.5px solid #2a2a35',
                position: 'sticky', left: 0, zIndex: 5,
                background: '#111115',
              }}>Date</th>
              {CONFIG.TECHNICIANS.map((tech, i) => (
                <th key={tech} style={{
                  padding: '8px 10px', fontSize: 13, fontWeight: 600,
                  color: '#e8e8f0', textAlign: 'center',
                  borderBottom: '0.5px solid #2a2a35',
                  borderRight: i < CONFIG.TECHNICIANS.length - 1
                    ? '0.5px solid #2a2a35' : 'none',
                  background: '#111115',
                  letterSpacing: '-0.01em',
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
                  {/* Month separator row */}
                  {isFirst && (
                    <tr key={`month-${ds}`} style={{ background: '#0a0a0c' }}>
                      <td colSpan={CONFIG.TECHNICIANS.length + 1} style={{
                        padding: '4px 10px', fontSize: 10, fontWeight: 700,
                        color: '#555566', textTransform: 'uppercase',
                        letterSpacing: '0.08em',
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
                    opacity: isWknd ? 0.6 : 1,
                  }}>
                    {/* Date label — sticky left */}
                    <td style={{
                      padding: '0 10px', fontSize: 11,
                      color: isToday ? '#7ec85a' : isWknd ? '#444455' : '#888899',
                      fontWeight: isToday ? 700 : 400,
                      borderBottom: '0.5px solid #1a1a1f',
                      borderRight: '0.5px solid #2a2a35',
                      position: 'sticky', left: 0, zIndex: 2,
                      background: isToday ? '#0d1a0d'
                        : isWknd ? '#0a0a0c' : '#0e0e10',
                      whiteSpace: 'nowrap',
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{format(d, 'EEE')}</div>
                      <div style={{ fontSize: 10 }}>{format(d, 'M/d')}</div>
                    </td>

                    {/* Tech cells */}
                    {CONFIG.TECHNICIANS.map((tech, ti) => {
                      const techEv  = techEventMap[tech]?.[ds];
                      const info    = cellInfo[`${tech}||${ds}`] || [];
                      const isBusy  = techBusyDates[tech]?.has(ds);
                      const isLast  = ti === CONFIG.TECHNICIANS.length - 1;

                      return (
                        <td key={tech}
                          onClick={() => {
                            if (!isBusy && !techEv) handleCellClick(tech, d);
                          }}
                          style={{
                            position: 'relative',
                            height: ROW_H,
                            borderBottom: '0.5px solid #1a1a1f',
                            borderRight: !isLast ? '0.5px solid #1a1a1f' : 'none',
                            cursor: editorToken && !isBusy && !techEv ? 'pointer' : 'default',
                            padding: '2px 2px',
                            verticalAlign: 'top',
                          }}>

                          {/* PTO / Holiday block */}
                          {techEv && (
                            <div
                              onClick={e => { e.stopPropagation(); setModal({ type: 'tech', event: techEv }); }}
                              title={`${techEv.event_type}${techEv.notes ? ': ' + techEv.notes : ''}`}
                              style={{
                                height: ROW_H - 4, borderRadius: 4, cursor: 'pointer',
                                background: getTechEventColor(techEv).bg,
                                border: `0.5px solid ${getTechEventColor(techEv).border}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, color: getTechEventColor(techEv).fg,
                                fontWeight: 600, textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}>
                              {techEv.event_type.toUpperCase()}
                            </div>
                          )}

                          {/* Job events */}
                          {!techEv && info.map(({ event, isStart, span }, ei) => {
                            const color = getEventColor(event);
                            // If this is a continuation (not start), show a thin continuation bar
                            // If this is the start, show the full labeled block
                            return isStart ? (
                              <div key={event.id}
                                onClick={e => { e.stopPropagation(); handleEventClick(event); }}
                                title={`${event.title}${event.ticket_id ? ' #' + event.ticket_id : ''}${event.notes ? '\n' + event.notes : ''}`}
                                style={{
                                  marginBottom: ei < info.length - 1 ? 2 : 0,
                                  height: info.length > 1 ? (ROW_H - 6) / info.length : ROW_H - 4,
                                  borderRadius: 4,
                                  background: color.bg,
                                  border: `0.5px solid ${color.border}`,
                                  borderLeft: `3px solid ${color.border}`,
                                  display: 'flex', alignItems: 'center',
                                  paddingLeft: 6, paddingRight: 4,
                                  fontSize: 11, color: color.fg, fontWeight: 500,
                                  overflow: 'hidden', whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  cursor: 'pointer', userSelect: 'none',
                                }}>
                                {event.title}
                                {event.ticket_id && (
                                  <span style={{ marginLeft: 4, opacity: 0.55, fontSize: 9 }}>
                                    #{event.ticket_id}
                                  </span>
                                )}
                              </div>
                            ) : (
                              // Continuation — show a colored bar without text
                              <div key={event.id}
                                onClick={e => { e.stopPropagation(); handleEventClick(event); }}
                                title={`${event.title} (continued)`}
                                style={{
                                  marginBottom: ei < info.length - 1 ? 2 : 0,
                                  height: info.length > 1 ? (ROW_H - 6) / info.length : ROW_H - 4,
                                  borderRadius: 4,
                                  background: color.bg,
                                  border: `0.5px solid ${color.border}`,
                                  borderLeft: `3px solid ${color.border}`,
                                  opacity: 0.7,
                                  cursor: 'pointer',
                                }}/>
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