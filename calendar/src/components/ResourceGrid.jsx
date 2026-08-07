import { useState, useMemo, useRef } from 'react';
import {
  format, eachDayOfInterval, startOfWeek, endOfWeek,
  addWeeks, subWeeks, isWeekend, parseISO, addDays,
  differenceInCalendarDays, getISOWeek,
} from 'date-fns';
import { CONFIG } from '../config';
import { layoutTechEvents } from '../utils/layoutTechEvents';
import JobModal from './JobModal';
import TechEventModal from './TechEventModal';

const COL_W  = 130;
const ROW_H  = 37;
const DATE_W = 60;

function getEventColor(ev) {
  // Ghost events get a distinct muted/dashed look
  if (ev.isGhost) return { bg: '#1a1a22', fg: '#555566', border: '#2a2a35' };
  if (ev.event_type !== 'calibration')
    return CONFIG.TYPE_COLORS[ev.event_type] || CONFIG.TYPE_COLORS.other;
  return CONFIG.STATUS_COLORS[ev.status] || CONFIG.STATUS_COLORS.ticketed;
}
function getTechEventColor(te) {
  return CONFIG.TYPE_COLORS[te.event_type] || CONFIG.TYPE_COLORS.other;
}

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
    spans[tech] = Object.entries(evMap).map(([, { event, dates }]) => {
      const sorted = [...dates].sort();
      return { event, dates: sorted };
    });
  });
  return spans;
}

export default function ResourceGrid({
  viewDate, events, assignments, techEvents,
  editorToken, requireEditor,
  onSaveEvent, onDeleteEvent,
  onSaveTechEvent, onSaveTechEventBatch, onDeleteTechEvent,
  // New props for job info panel
  onEventHover, onEventHoverEnd, onEventClick, lockedEventId,
}) {
  const [modal,     setModal]     = useState(null);
  const [dragOver,  setDragOver]  = useState(null);
  const [hoverCard, setHoverCard] = useState(null);
  const dragRef = useRef(null);

  const rangeStart = startOfWeek(subWeeks(viewDate, 2), { weekStartsOn: 1 });
  const rangeEnd   = endOfWeek(addWeeks(viewDate, 10),  { weekStartsOn: 1 });

  const days = useMemo(() =>
    eachDayOfInterval({ start: rangeStart, end: rangeEnd })
      .filter(d => !isWeekend(d)),
    [rangeStart.toISOString(), rangeEnd.toISOString()]
  );
  const dayStrs = useMemo(() => days.map(d => format(d, 'yyyy-MM-dd')), [days]);
  const today   = format(new Date(), 'yyyy-MM-dd');

  const spans       = useMemo(() => buildSpans(events, assignments, dayStrs), [events, assignments, dayStrs]);
  const techLayouts = useMemo(() => {
    const m = {};
    CONFIG.TECHNICIANS.forEach(tech => { m[tech] = layoutTechEvents(spans[tech], dayStrs); });
    return m;
  }, [spans, dayStrs]);

  const techEventMap = useMemo(() => {
    const m = {};
    techEvents.forEach(te => {
      if (!m[te.tech_name]) m[te.tech_name] = {};
      if (!m[te.tech_name][te.date]) m[te.tech_name][te.date] = [];
      m[te.tech_name][te.date].push(te);
    });
    return m;
  }, [techEvents]);

  const techBusyDates = useMemo(() => {
    const m = {};
    CONFIG.TECHNICIANS.forEach(t => { m[t] = new Set(); });
    assignments.forEach(a => { if (m[a.tech_name]) m[a.tech_name].add(a.date); });
    return m;
  }, [assignments]);

  function getRowHeight(ds) {
    let maxLanes = 1;
    CONFIG.TECHNICIANS.forEach(tech => {
      const layout = techLayouts[tech] || [];
      const active = layout.filter(l => l.dates.includes(ds));
      if (active.length > maxLanes) maxLanes = active.length;
    });
    return ROW_H * maxLanes;
  }

  function isOddWeek(d) { return getISOWeek(d) % 2 === 1; }
  function isMonday(d)  { return d.getDay() === 1; }

  /* ── Drag ─────────────────────────────────────────────── */
  function handleEventMouseDown(e, event, fromTech, fromDs) {
    if (!editorToken) return;
    if (event.isGhost) {
      // Ghost events open modal on click only — no drag
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setHoverCard(null);
    dragRef.current = { event, fromTech, fromDs, startX: e.clientX, startY: e.clientY, moved: false };
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
      const { moved, event } = dragRef.current;
      dragRef.current = null;
      if (!moved) {
        openJobModal(event);
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function openJobModal(event) {
    setModal({
      type: 'job',
      event: { ...event, assignments: assignments.filter(a => String(a.event_id) === String(event.id)) },
    });
  }

  function handleCellMouseEnter(tech, ds) {
    if (dragRef.current?.moved) setDragOver({ tech, ds });
  }

  function handleCellMouseUp(toTech, toDs) {
    setDragOver(null);
    if (!dragRef.current?.moved) return;

    if (dragRef.current.isTechEvent) {
      const { techEv, fromTech, fromDs } = dragRef.current;
      dragRef.current = null;
      if (toDs === fromDs && toTech === fromTech) return;
      requireEditor(async token => {
        await onDeleteTechEvent(techEv.id, token);
        await onSaveTechEvent({
          tech_name:  toTech,
          event_type: techEv.event_type,
          date:       toDs,
          notes:      techEv.notes,
        }, token);
      });
      return;
    }

    const { event, fromTech, fromDs } = dragRef.current;
    dragRef.current = null;
    const dateOffset  = differenceInCalendarDays(parseISO(toDs), parseISO(fromDs));
    const techChanged = toTech !== fromTech;
    if (!techChanged && dateOffset === 0) return;
    const evAssignments = assignments.filter(a => String(a.event_id) === String(event.id));
    const newAssignments = evAssignments.map(a => ({
      tech_name: (techChanged && a.tech_name === fromTech) ? toTech : a.tech_name,
      date: format(addDays(parseISO(a.date), dateOffset), 'yyyy-MM-dd'),
    }));
    const newStart = format(addDays(parseISO(event.start_date), dateOffset), 'yyyy-MM-dd');
    const newEnd   = format(addDays(parseISO(event.end_date),   dateOffset), 'yyyy-MM-dd');
    requireEditor(async token => {
      await onSaveEvent({ ...event, start_date: newStart, end_date: newEnd, assignments: newAssignments }, token);
    });
  }

  function handleCellClick(tech, d) {
    if (!editorToken) return;
    const ds = format(d, 'yyyy-MM-dd');
    const te = techEventMap[tech]?.[ds] || [];
    if (te.length) { setModal({ type: 'tech', event: te[0] }); return; }
    setModal({ type: 'job', event: null, initialDate: d, initialTech: tech });
  }

  function handleTechEventMouseDown(e, techEv, fromTech, fromDs) {
    if (!editorToken) return;
    e.preventDefault();
    e.stopPropagation();
    setHoverCard(null);
    dragRef.current = {
      techEv, fromTech, fromDs,
      isTechEvent: true,
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
      const { moved, techEv } = dragRef.current;
      dragRef.current = null;
      if (!moved) setModal({ type: 'tech', event: techEv });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const btnStyle = (primary) => ({
    background: primary ? '#3a7bd5' : '#1e1e24',
    border: `0.5px solid ${primary ? '#3a7bd5' : '#2a2a35'}`,
    borderRadius: 4, color: primary ? '#fff' : '#e8e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 12px', cursor: 'pointer',
  });

  const monthSeparators = useMemo(() => {
    const s = new Set();
    days.forEach((d, di) => {
      if (di > 0 && format(days[di-1], 'MM') !== format(d, 'MM'))
        s.add(format(d, 'yyyy-MM-dd'));
    });
    return s;
  }, [days]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>

      {/* Hover card tooltip */}
      {hoverCard && (
        <div style={{
          position: 'fixed',
          left: hoverCard.x + 12, top: hoverCard.y + 12,
          background: '#1e1e28', border: '0.5px solid #3a3a50',
          borderRadius: 6, padding: '8px 12px',
          fontSize: 12, color: '#e8e8f0',
          zIndex: 9999, pointerEvents: 'none', maxWidth: 260,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {hoverCard.type === 'tech' ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>{hoverCard.data.tech_name}</div>
              <div style={{ color: getTechEventColor(hoverCard.data).fg,
                textTransform: 'uppercase', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.04em', marginBottom: 4 }}>
                {hoverCard.data.event_type}
              </div>
              <div style={{ color: '#888899', fontSize: 11 }}>{hoverCard.data.date}</div>
              {hoverCard.data.notes && (
                <div style={{ color: '#aaaabc', fontSize: 11, marginTop: 4,
                  borderTop: '0.5px solid #2a2a35', paddingTop: 4 }}>
                  {hoverCard.data.notes}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>{hoverCard.data.title}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                {hoverCard.data.ticket_id && (
                  <span style={{ color: '#888899', fontSize: 11 }}>#{hoverCard.data.ticket_id}</span>
                )}
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: hoverCard.data.isGhost ? '#c47a1a'
                    : (CONFIG.STATUS_COLORS[hoverCard.data.status] || CONFIG.STATUS_COLORS.ticketed).fg }}>
                  {hoverCard.data.isGhost ? 'tentative' : hoverCard.data.status}
                </span>
              </div>
              <div style={{ color: '#555566', fontSize: 10 }}>
                {hoverCard.data.start_date}
                {hoverCard.data.end_date !== hoverCard.data.start_date && ` → ${hoverCard.data.end_date}`}
              </div>
              {hoverCard.data.notes && (
                <div style={{ color: '#aaaabc', fontSize: 11, marginTop: 4,
                  borderTop: '0.5px solid #2a2a35', paddingTop: 4 }}>
                  {hoverCard.data.notes}
                </div>
              )}
            </>
          )}
        </div>
      )}

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
          onSaveBatch={(entries) => requireEditor(token => onSaveTechEventBatch(entries, token))}
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
          {/* Tentative ghost indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2,
              background: '#1a1a22', border: '1px dashed #555566',
              display: 'inline-block' }}/>
            <span style={{ fontSize: 11, color: '#888899' }}>tentative</span>
          </div>
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
              {CONFIG.TECHNICIANS.map((tech, i) => {
                const tc = CONFIG.TECH_COLORS?.[tech] || { bg: '#1a1a22', fg: '#e8e8f0', border: '#2a2a35' };
                return (
                  <th key={tech} style={{
                    padding: '8px 10px', fontSize: 13, fontWeight: 600,
                    color: tc.fg, textAlign: 'center',
                    borderBottom: `2px solid ${tc.border}`,
                    borderRight: i < CONFIG.TECHNICIANS.length - 1 ? '0.5px solid #2a2a35' : 'none',
                    background: tc.bg, letterSpacing: '-0.01em',
                  }}>{tech}</th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {days.map((d, di) => {
              const ds      = format(d, 'yyyy-MM-dd');
              const isToday = ds === today;
              const isMon   = isMonday(d);
              const oddWeek = isOddWeek(d);
              const rowH    = getRowHeight(ds);
              const isSep   = monthSeparators.has(ds);
              const weekBg  = isToday
                ? 'rgba(90,158,47,0.06)'
                : oddWeek ? 'rgba(255,255,255,0.012)' : 'transparent';

              return (
                <>
                  {isSep && (
                    <tr key={`month-${ds}`}>
                      <td colSpan={CONFIG.TECHNICIANS.length + 1} style={{
                        padding: '5px 10px', fontSize: 10, fontWeight: 700,
                        color: '#555566', textTransform: 'uppercase',
                        letterSpacing: '0.08em', background: '#0a0a0c',
                        borderTop: '0.5px solid #2a2a35',
                        borderBottom: '0.5px solid #2a2a35',
                      }}>{format(d, 'MMMM yyyy')}</td>
                    </tr>
                  )}

                  <tr key={ds} style={{ height: rowH, background: weekBg,
                    borderTop: isMon ? '1px solid #2a2a40' : undefined }}>
                    <td style={{
                      padding: '0 8px', fontSize: 11,
                      color: isToday ? '#7ec85a' : isMon ? '#aaaacc' : '#888899',
                      fontWeight: isToday || isMon ? 600 : 400,
                      borderBottom: '0.5px solid #1a1a1f',
                      borderRight: '0.5px solid #2a2a35',
                      borderTop: isMon ? '1px solid #2a2a40' : undefined,
                      position: 'sticky', left: 0, zIndex: 2,
                      background: isToday ? '#0d1a0d' : oddWeek ? '#0f0f14' : '#0e0e10',
                      whiteSpace: 'nowrap', verticalAlign: 'middle', height: rowH,
                    }}>
                      <span style={{ fontWeight: 600 }}>{format(d, 'EEE')} </span>
                      <span style={{ fontSize: 10 }}>{format(d, 'M/d')}</span>
                    </td>

                    {CONFIG.TECHNICIANS.map((tech, ti) => {
                      const isLast       = ti === CONFIG.TECHNICIANS.length - 1;
                      const techEvs      = techEventMap[tech]?.[ds] || [];
                      const layout       = techLayouts[tech] || [];
                      const activeOnDay  = layout.filter(l => l.dates.includes(ds));
                      const startingHere = activeOnDay.filter(l => l.dates[0] === ds);
                      const isDropTarget = dragOver?.tech === tech && dragOver?.ds === ds;
                      const tc           = CONFIG.TECH_COLORS?.[tech];

                      return (
                        <td key={tech}
                          onMouseEnter={() => handleCellMouseEnter(tech, ds)}
                          onMouseUp={() => handleCellMouseUp(tech, ds)}
                          onClick={() => {
                            if (!activeOnDay.length && !techEvs.length) handleCellClick(tech, d);
                          }}
                          style={{
                            position: 'relative', height: rowH,
                            borderBottom: '0.5px solid #1a1a1f',
                            borderRight: !isLast ? '0.5px solid #1a1a1f' : 'none',
                            borderTop: isMon ? '1px solid #2a2a40' : undefined,
                            cursor: editorToken && !activeOnDay.length && !techEvs.length ? 'pointer' : 'default',
                            padding: 0, verticalAlign: 'top',
                            background: isDropTarget ? 'rgba(58,123,213,0.15)' : 'transparent',
                            outline: isDropTarget ? '1.5px dashed #3a7bd5' : 'none',
                            outlineOffset: -2,
                          }}>

                          {/* PTO / Holiday */}
                          {techEvs.length > 0 && (
                            <div style={{ position: 'absolute', inset: '3px 2px',
                              display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {techEvs.map(te => (
                                <div key={te.id}
                                  onMouseDown={e => handleTechEventMouseDown(e, te, tech, ds)}
                                  onClick={e => { e.stopPropagation(); setModal({ type: 'tech', event: te }); }}
                                  onMouseEnter={e => {
                                    if (dragRef.current) return;
                                    setHoverCard({ type: 'tech', data: te, x: e.clientX, y: e.clientY });
                                  }}
                                  onMouseMove={e => {
                                    if (dragRef.current) return;
                                    setHoverCard(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                                  }}
                                  onMouseLeave={() => setHoverCard(null)}
                                  style={{
                                    flex: 1, borderRadius: 4, cursor: 'pointer',
                                    background: getTechEventColor(te).bg,
                                    border: `0.5px solid ${getTechEventColor(te).border}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, color: getTechEventColor(te).fg,
                                    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                                    zIndex: 2,
                                  }}>
                                  {te.event_type.slice(0, 3).toUpperCase()}
                                </div>
                                
                              ))}
                            </div>
                          )}

                          {/* Job event blocks */}
                          {!techEvs.length && startingHere.map(l => {
                            const color       = getEventColor(l.event);
                            const totalH      = l.dates.reduce((sum, sds) => sum + getRowHeight(sds), 0) - 6;
                            const laneH       = totalH / (l.totalLanes || 1);
                            const blockTop    = l.lane * laneH + 3;
                            const blockH      = laneH - 2;
                            const accentColor = l.event.isGhost ? '#555566' : (tc ? tc.fg : color.fg);
                            const showNotes   = l.event.notes && blockH > 30;
                            const isLocked    = String(l.event.id) === String(lockedEventId);
                            const isGhost     = l.event.isGhost;

                            return (
                              
                              <div key={l.event.id}
                              
                                onMouseDown={e => handleEventMouseDown(e, l.event, tech, ds)}
                                onMouseEnter={e => {
                                  if (dragRef.current) return;
                                  setHoverCard({ type: 'job', data: l.event, x: e.clientX, y: e.clientY });
                                  onEventHover?.(l.event);
                                }}
                                onMouseMove={e => {
                                  if (dragRef.current) return;
                                  setHoverCard(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                                }}
                                onMouseLeave={() => {
                                  setHoverCard(null);
                                  onEventHoverEnd?.();
                                }}
                                
                                onClick={e => {
                                  e.stopPropagation();
                                  if (isGhost && editorToken) {
                                    // Ghost click → open modal to confirm/edit
                                    openJobModal(l.event);
                                  }
                                }}
                                
                                
                               //title={`${l.event.title}${l.event.isGhost ? ' (tentative)' : ''}${l.event.ticket_id ? ' #' + l.event.ticket_id : ''}${l.event.notes ? '\n' + l.event.notes : ''}`}
                                style={{
                                  position: 'absolute',
                                  top: blockTop, left: 1, right: 1,
                                  height: blockH,
                                  borderRadius: 4,
                                  background: color.bg,
                                  border: isGhost
                                    ? '1px dashed #333344'
                                    : `0.5px solid ${color.border}`,
                                  borderLeft: isGhost
                                    ? '3px dashed #555566'
                                    : `3px solid ${accentColor}`,
                                  outline: isLocked ? `2px solid ${accentColor}` : 'none',
                                  outlineOffset: 1,
                                  opacity: isGhost ? 0.6 : 1,
                                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                  paddingLeft: 3, paddingRight: 3,
                                  overflow: 'hidden',
                                  cursor: editorToken ? (isGhost ? 'pointer' : 'grab') : 'pointer',
                                  userSelect: 'none', zIndex: 3,
                                  minWidth: 0,
                                }}>
                                {/* Info icon — top right of block */}
                                  <div
                                    onMouseDown={e => {
                                      e.stopPropagation();
                                    }}
                                    onClick={e => {
                                      e.stopPropagation();
                                      onEventClick?.(l.event);
                                    }}
                                    title="Pin / Unpin job info"
                                    style={{
                                      position: 'absolute',
                                      top: 2, right: 2,
                                      width: 14, height: 14,
                                      borderRadius: 3,
                                      background: 'rgba(0,0,0,0.3)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      cursor: 'pointer', zIndex: 4, flexShrink: 0,
                                      fontSize: 11, color: color.fg, opacity: 0.7,
                                      fontWeight: 700,
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                                  >
                                    ℹ
                                  </div>

                                <div style={{ display: 'flex', alignItems: 'center',
                                  overflow: 'hidden', minWidth: 0, whiteSpace: 'nowrap' }}>
                                  <span style={{ flexShrink: 1, overflow: 'hidden',
                                    textOverflow: 'ellipsis', minWidth: 0,
                                    fontSize: 11, color: color.fg, fontWeight: 500 }}>
                                    {l.event.title}
                                  </span>
                                  {l.event.ticket_id && (
                                    <span style={{ position: 'absolute',
                                      top: 0, left: 0, marginLeft: 4, opacity: 0.55, fontSize: 11,
                                      flexShrink: 0, whiteSpace: 'nowrap', color: color.fg }}>
                                      #{l.event.ticket_id}
                                    </span>
                                  )}
                                  <span style={{ position: 'absolute',
                                      bottom: 2, right: 2, marginLeft: 'auto', paddingLeft: 6,
                                    fontSize: 11, opacity: 0.45, flexShrink: 2,
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap', minWidth: 0, color: color.fg }}>
                                    {isGhost ? 'tentative'
                                      : l.event.event_type !== 'calibration'
                                        ? l.event.event_type + (l.event.status ? ' · ' + l.event.status : '')
                                        : l.event.status || ''}
                                  </span>
                                  
                                </div>

                                {showNotes && (
                                  <div style={{ fontSize: 11, opacity: 0.45,
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap', minWidth: 0,
                                    marginTop: 2, color: color.fg }}>
                                    {l.event.notes}
                                  </div>
                                  
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
