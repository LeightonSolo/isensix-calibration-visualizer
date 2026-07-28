import { useState, useMemo, useRef, useCallback } from 'react';
import {
  format, eachDayOfInterval, startOfWeek, endOfWeek,
  addWeeks, subWeeks, isSameDay, isWeekend, parseISO,
  addDays, differenceInCalendarDays, isWithinInterval,
} from 'date-fns';
import { CONFIG } from '../config';
import JobModal from './JobModal';
import TechEventModal from './TechEventModal';

const CELL_W  = 44;   // px per day column
const ROW_H   = 36;   // px per tech row
const HDR_H   = 56;   // date header height
const TECH_W  = 90;   // tech name column width
const WEEKEND_OPACITY = 0.35;

function getEventColor(event) {
  if (event.event_type !== 'calibration') {
    return CONFIG.TYPE_COLORS[event.event_type] || CONFIG.TYPE_COLORS.other;
  }
  return CONFIG.STATUS_COLORS[event.status] || CONFIG.STATUS_COLORS.ticketed;
}

function getTechEventColor(te) {
  return CONFIG.TYPE_COLORS[te.event_type] || CONFIG.TYPE_COLORS.other;
}

// Build a map: techName -> dateStr -> [events]
function buildTechDateMap(events, assignments) {
  const assignMap = {};
  assignments.forEach(a => {
    const key = `${a.tech_name}||${a.date}`;
    if (!assignMap[key]) assignMap[key] = [];
    // coerce both to string for comparison
    const ev = events.find(e => String(e.id) === String(a.event_id));
    if (ev) assignMap[key].push(ev);
  });
  return assignMap;
}

export default function ResourceGrid({
  viewDate, events, assignments, techEvents,
  editorToken, requireEditor,
  onSaveEvent, onDeleteEvent,
  onSaveTechEvent, onDeleteTechEvent,
}) {
  const [modal,      setModal]      = useState(null); // { type: 'job'|'tech', event?, date?, tech? }
  const [dragState,  setDragState]  = useState(null);
  const [hoverCell,  setHoverCell]  = useState(null); // { tech, date }
  const [selecting,  setSelecting]  = useState(null); // { tech, startDate, endDate }

  // Build visible date range: 10 weeks
  const rangeStart = startOfWeek(subWeeks(viewDate, 1), { weekStartsOn: 1 });
  const rangeEnd   = endOfWeek(addWeeks(viewDate, 9),   { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const techDateMap = useMemo(
    () => buildTechDateMap(events, assignments),
    [events, assignments]
  );

  // Tech events map: techName -> dateStr -> techEvent
  const techEventMap = useMemo(() => {
    const m = {};
    techEvents.forEach(te => {
      if (!m[te.tech_name]) m[te.tech_name] = {};
      m[te.tech_name][te.date] = te;
    });
    return m;
  }, [techEvents]);

  // Today
  const today = format(new Date(), 'yyyy-MM-dd');

  /* ── Drag to move event ───────────────────────────────── */
  const dragRef = useRef(null);

  function handleEventMouseDown(e, event, techName, dateStr) {
    if (!editorToken) return;
    e.stopPropagation();
    dragRef.current = {
      event,
      originalTech: techName,
      originalDate: dateStr,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    function onMove(me) {
      if (!dragRef.current) return;
      const dx = Math.abs(me.clientX - dragRef.current.startX);
      const dy = Math.abs(me.clientY - dragRef.current.startY);
      if (dx > 6 || dy > 6) dragRef.current.moved = true;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragRef.current) return;
      const { moved, event } = dragRef.current;
      dragRef.current = null;
      setDragState(null);
      if (!moved) {
        // treat as click → open modal
        setModal({ type: 'job', event, tech: techName });
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /* ── Click empty cell to start selection ─────────────── */
  function handleCellMouseDown(e, tech, date) {
    if (!editorToken) {
      // view only: open tech event if exists, else nothing
      const te = techEventMap[tech]?.[format(date, 'yyyy-MM-dd')];
      if (te) setModal({ type: 'tech', event: te });
      return;
    }
    e.preventDefault();
    const ds = format(date, 'yyyy-MM-dd');
    setSelecting({ tech, startDate: ds, endDate: ds });

    function onMove(me) {
      // find which date cell mouse is over by calculating offset
      // simple approach: update endDate as mouse moves
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setSelecting(prev => {
        if (!prev) return null;
        // open create modal with selected range
        setModal({
          type: 'job',
          event: null,
          initialDate: parseISO(prev.startDate),
          initialEndDate: parseISO(prev.endDate),
          initialTech: prev.tech,
        });
        return null;
      });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleCellMouseEnter(tech, date) {
    const ds = format(date, 'yyyy-MM-dd');
    setHoverCell({ tech, date: ds });
    if (selecting && tech === selecting.tech) {
      setSelecting(prev => prev ? { ...prev, endDate: ds } : null);
    }
  }

  /* ── Drop on cell ────────────────────────────────────── */
  async function handleCellMouseUp(e, tech, date) {
    if (!dragRef.current?.moved) return;
    const { event, originalDate } = dragRef.current;
    const ds = format(date, 'yyyy-MM-dd');
    // Calculate day offset
    const offset = differenceInCalendarDays(date, parseISO(originalDate));
    if (offset === 0 && tech === dragRef.current.originalTech) return;

    const newStart = format(addDays(parseISO(event.start_date), offset), 'yyyy-MM-dd');
    const newEnd   = format(addDays(parseISO(event.end_date),   offset), 'yyyy-MM-dd');

    // Rebuild assignments shifted by same offset, keeping tech structure
    // but updating the dragged tech if it changed
    const currentAssignments = assignments.filter(a => a.event_id === event.id);
    const newAssignments = currentAssignments.map(a => ({
      tech_name: a.tech_name === dragRef.current.originalTech ? tech : a.tech_name,
      date: format(addDays(parseISO(a.date), offset), 'yyyy-MM-dd'),
    }));

    requireEditor(async token => {
      await onSaveEvent({
        ...event,
        start_date: newStart,
        end_date:   newEnd,
        assignments: newAssignments,
      }, token);
    });
  }

  /* ── Render ───────────────────────────────────────────── */
  const gridWidth = TECH_W + days.length * CELL_W;

  // Month label positions
  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = null;
    days.forEach((d, i) => {
      const m = format(d, 'MMM yyyy');
      if (m !== lastMonth) {
        labels.push({ label: format(d, 'MMMM yyyy'), index: i });
        lastMonth = m;
      }
    });
    return labels;
  }, [days]);

  return (
    <div>
      {/* Modals */}
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        {editorToken && (
          <>
            <button
              onClick={() => setModal({ type: 'job', event: null, initialDate: new Date() })}
              style={{
                background: '#3a7bd5', border: '0.5px solid #3a7bd5',
                borderRadius: 4, color: '#fff', fontSize: 12,
                padding: '5px 12px', cursor: 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
              + Add job
            </button>
            <button
              onClick={() => setModal({ type: 'tech', event: null, initialDate: new Date() })}
              style={{
                background: '#1e1e24', border: '0.5px solid #2a2a35',
                borderRadius: 4, color: '#e8e8f0', fontSize: 12,
                padding: '5px 12px', cursor: 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
              + PTO / Holiday
            </button>
          </>
        )}
        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {Object.entries(CONFIG.STATUS_COLORS).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2,
                background: c.bg, border: `1px solid ${c.border}`,
                display: 'inline-block' }}/>
              <span style={{ fontSize: 11, color: '#888899', textTransform: 'capitalize' }}>{s}</span>
            </div>
          ))}
          {['install','upgrade','pto'].map(t => {
            const c = CONFIG.TYPE_COLORS[t];
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2,
                  background: c.bg, border: `1px solid ${c.border}`,
                  display: 'inline-block' }}/>
                <span style={{ fontSize: 11, color: '#888899', textTransform: 'capitalize' }}>{t}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)',
        border: '0.5px solid #2a2a35', borderRadius: 8 }}>
        <div style={{ position: 'relative', width: gridWidth }}>

          {/* Month row */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 4,
            background: '#0e0e10', borderBottom: '0.5px solid #2a2a35' }}>
            <div style={{ width: TECH_W, flexShrink: 0 }}/>
            <div style={{ position: 'relative', flex: 1, height: 22 }}>
              {monthLabels.map(({ label, index }) => (
                <div key={label} style={{
                  position: 'absolute',
                  left: index * CELL_W,
                  top: 0, height: 22,
                  display: 'flex', alignItems: 'center',
                  paddingLeft: 6,
                  fontSize: 10, fontWeight: 600,
                  color: '#888899', textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>{label}</div>
              ))}
            </div>
          </div>

          {/* Day header */}
          <div style={{ display: 'flex', position: 'sticky', top: 22, zIndex: 4,
            background: '#111115', borderBottom: '0.5px solid #2a2a35' }}>
            <div style={{ width: TECH_W, flexShrink: 0, padding: '6px 10px',
              fontSize: 11, fontWeight: 500, color: '#555566',
              borderRight: '0.5px solid #2a2a35' }}>Tech</div>
            {days.map(d => {
              const ds = format(d, 'yyyy-MM-dd');
              const isToday = ds === today;
              const isWknd  = isWeekend(d);
              return (
                <div key={ds} style={{
                  width: CELL_W, flexShrink: 0, textAlign: 'center',
                  padding: '4px 2px', fontSize: 10,
                  borderRight: '0.5px solid #1a1a1f',
                  background: isToday ? 'rgba(90,158,47,0.15)' : isWknd ? '#0a0a0c' : 'transparent',
                  borderBottom: isToday ? '2px solid #5a9e2f' : '0.5px solid #2a2a35',
                  opacity: isWknd ? WEEKEND_OPACITY : 1,
                }}>
                  <div style={{ color: isToday ? '#7ec85a' : '#555566',
                    fontWeight: isToday ? 700 : 400 }}>
                    {format(d, 'EEE')}
                  </div>
                  <div style={{ color: isToday ? '#7ec85a' : '#888899',
                    fontWeight: isToday ? 700 : 400 }}>
                    {format(d, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tech rows */}
          {CONFIG.TECHNICIANS.map((tech, ti) => (
            <div key={tech} style={{
              display: 'flex',
              borderBottom: ti < CONFIG.TECHNICIANS.length - 1
                ? '0.5px solid #1a1a1f' : 'none',
              position: 'relative',
              height: ROW_H,
            }}>
              {/* Tech label */}
              <div style={{
                width: TECH_W, flexShrink: 0,
                display: 'flex', alignItems: 'center',
                padding: '0 10px', fontSize: 12, fontWeight: 500,
                color: '#e8e8f0',
                borderRight: '0.5px solid #2a2a35',
                position: 'sticky', left: 0, zIndex: 2,
                background: '#111115',
              }}>{tech}</div>

              {/* Day cells */}
              {days.map(d => {
                const ds = format(d, 'yyyy-MM-dd');
                const isToday = ds === today;
                const isWknd  = isWeekend(d);
                const cellEvents = techDateMap[`${tech}||${ds}`] || [];
                const techEv     = techEventMap[tech]?.[ds];
                const isHovered  = hoverCell?.tech === tech && hoverCell?.date === ds;
                const isSelecting = selecting?.tech === tech &&
                  ds >= Math.min(selecting.startDate, selecting.endDate) &&
                  ds <= Math.max(selecting.startDate, selecting.endDate);

                return (
                  <div key={ds}
                    onMouseDown={e => {
                      if (cellEvents.length === 0 && !techEv) {
                        handleCellMouseDown(e, tech, d);
                      }
                    }}
                    onMouseEnter={() => handleCellMouseEnter(tech, d)}
                    onMouseUp={e => handleCellMouseUp(e, tech, d)}
                    style={{
                      width: CELL_W, flexShrink: 0,
                      height: ROW_H, position: 'relative',
                      borderRight: '0.5px solid #1a1a1f',
                      background: isSelecting ? 'rgba(58,123,213,0.2)'
                      : isToday ? 'rgba(90,158,47,0.04)'
                      : isWknd ? 'rgba(0,0,0,0.3)'
                      : 'transparent',
                      cursor: editorToken ? 'pointer' : 'default',
                      opacity: isWknd ? WEEKEND_OPACITY : 1,
                    }}>

                    {/* Tech event (PTO etc) */}
                    {techEv && (
                      <div
                        onClick={() => setModal({ type: 'tech', event: techEv })}
                        title={`${techEv.event_type}${techEv.notes ? ': ' + techEv.notes : ''}`}
                        style={{
                          position: 'absolute', inset: '2px 1px',
                          borderRadius: 3, cursor: 'pointer',
                          background: getTechEventColor(techEv).bg,
                          border: `0.5px solid ${getTechEventColor(techEv).border}`,
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9, color: getTechEventColor(techEv).fg,
                          fontWeight: 500, textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          zIndex: 1,
                        }}>
                        {techEv.event_type.slice(0, 3)}
                      </div>
                    )}

                    {/* Job events */}
                    {cellEvents.slice(0, 2).map((ev, ei) => {
                      const color = getEventColor(ev);
                      return (
                        <div key={ev.id}
                          onMouseDown={e => handleEventMouseDown(e, ev, tech, ds)}
                          title={`${ev.title}${ev.ticket_id ? ' #' + ev.ticket_id : ''}${ev.notes ? '\n' + ev.notes : ''}`}
                          style={{
                            position: 'absolute',
                            top: 2 + ei * 16,
                            left: 1, right: 1,
                            height: 14,
                            borderRadius: 3,
                            background: color.bg,
                            border: `0.5px solid ${color.border}`,
                            display: 'flex', alignItems: 'center',
                            paddingLeft: 4, paddingRight: 2,
                            fontSize: 9, color: color.fg,
                            fontWeight: 500,
                            overflow: 'hidden', whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            cursor: editorToken ? 'grab' : 'pointer',
                            zIndex: 1,
                            userSelect: 'none',
                          }}>
                          {ev.title}
                          {ev.ticket_id && (
                            <span style={{ marginLeft: 3, opacity: 0.7, fontSize: 8 }}>
                              #{ev.ticket_id}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {cellEvents.length > 2 && (
                      <div style={{
                        position: 'absolute', bottom: 1, right: 2,
                        fontSize: 8, color: '#555566',
                      }}>+{cellEvents.length - 2}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {!editorToken && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#555566', textAlign: 'center' }}>
          View only — click Editor login to make changes
        </div>
      )}
    </div>
  );
}
