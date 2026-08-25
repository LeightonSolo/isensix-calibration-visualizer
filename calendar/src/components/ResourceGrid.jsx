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
import {
  withAutomaticUnassigned,
  withoutAutomaticUnassigned,
} from '../utils/calendarAssignments.js';

const COL_W  = 130;
const ROW_H  = 37;
const DATE_W = 60;
const RESOURCE_TECHNICIANS = [...CONFIG.TECHNICIANS, CONFIG.UNASSIGNED_TECHNICIAN];

function getEventColor(ev) {
  // Ghost events get a distinct muted/dashed look
  if (ev.isGhost) return { bg: 'var(--cal-card)', fg: 'var(--cal-text-muted)', border: 'var(--cal-border)' };
  if (ev.event_type !== 'calibration')
    return CONFIG.TYPE_COLORS[ev.event_type] || CONFIG.TYPE_COLORS.other;
  return CONFIG.STATUS_COLORS[ev.status] || CONFIG.STATUS_COLORS.ticketed;
}
function getTechEventColor(te) {
  return CONFIG.TYPE_COLORS[te.event_type] || CONFIG.TYPE_COLORS.other;
}

function eventTitleFontSize(blockHeight, title) {
  const length = String(title || '').length;
  const lengthLimit = length <= 12 ? 20 : length <= 22 ? 17 : length <= 34 ? 15 : 13;
  return Math.min(lengthLimit, Math.max(12, Math.round(10 + blockHeight / 18)));
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
  jobInfoMap, serverMeta,
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

  const displayAssignments = useMemo(
    () => withAutomaticUnassigned(events, assignments, dayStrs),
    [events, assignments, dayStrs]
  );
  const spans       = useMemo(
    () => buildSpans(events, displayAssignments, dayStrs),
    [events, displayAssignments, dayStrs]
  );
  const techLayouts = useMemo(() => {
    const m = {};
    RESOURCE_TECHNICIANS.forEach(tech => { m[tech] = layoutTechEvents(spans[tech], dayStrs); });
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
    RESOURCE_TECHNICIANS.forEach(t => { m[t] = new Set(); });
    displayAssignments.forEach(a => { if (m[a.tech_name]) m[a.tech_name].add(a.date); });
    return m;
  }, [displayAssignments]);

  function getRowHeight(ds) {
    let maxLanes = 1;
    RESOURCE_TECHNICIANS.forEach(tech => {
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
      event: {
        ...event,
        assignments: withoutAutomaticUnassigned(
          assignments.filter(a => String(a.event_id) === String(event.id))
        ),
      },
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
    const dragAssignments = withAutomaticUnassigned([event], evAssignments);
    const newAssignments = withoutAutomaticUnassigned(dragAssignments.map(a => ({
      tech_name: (techChanged && a.tech_name === fromTech) ? toTech : a.tech_name,
      date: format(addDays(parseISO(a.date), dateOffset), 'yyyy-MM-dd'),
    })));
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
    background: primary ? 'var(--cal-accent)' : 'var(--cal-input)',
    border: `0.5px solid ${primary ? 'var(--cal-accent)' : 'var(--cal-border)'}`,
    borderRadius: 4, color: primary ? '#fff' : 'var(--cal-text)',
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
    <div className="resource-grid">

      {/* Hover card tooltip */}
      {hoverCard && (
        <div style={{
          position: 'fixed',
          left: hoverCard.x + 12, top: hoverCard.y + 12,
          background: 'var(--cal-popover)', border: '0.5px solid var(--cal-border-strong)',
          borderRadius: 6, padding: '8px 12px',
          fontSize: 14, color: 'var(--cal-text)',
          zIndex: 9999, pointerEvents: 'none', maxWidth: 260,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {hoverCard.type === 'tech' ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>{hoverCard.data.tech_name}</div>
              <div style={{ color: getTechEventColor(hoverCard.data).fg,
                textTransform: 'uppercase', fontSize: 13, fontWeight: 600,
                letterSpacing: '0.04em', marginBottom: 4 }}>
                {hoverCard.data.event_type}
              </div>
              <div style={{ color: 'var(--cal-text-secondary)', fontSize: 13 }}>{hoverCard.data.date}</div>
              {hoverCard.data.notes && (
                <div style={{ color: 'var(--cal-text-soft)', fontSize: 13, marginTop: 4,
                  borderTop: '0.5px solid var(--cal-border)', paddingTop: 4 }}>
                  {hoverCard.data.notes}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>{hoverCard.data.title}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                {hoverCard.data.ticket_id && (
                  <span style={{ color: 'var(--cal-text-secondary)', fontSize: 13 }}>#{hoverCard.data.ticket_id}</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: hoverCard.data.isGhost ? 'var(--cal-warning)'
                    : (CONFIG.STATUS_COLORS[hoverCard.data.status] || CONFIG.STATUS_COLORS.ticketed).fg }}>
                  {hoverCard.data.isGhost ? 'tentative' : hoverCard.data.status}
                </span>
              </div>
              <div style={{ color: 'var(--cal-text)', fontSize: 13 }}>
                {hoverCard.data.start_date}
                {hoverCard.data.end_date !== hoverCard.data.start_date && ` → ${hoverCard.data.end_date}`}
              </div>
              {hoverCard.data.notes && (
                <div style={{ color: 'var(--cal-text-soft)', fontSize: 13, marginTop: 4,
                  borderTop: '0.5px solid var(--cal-border)', paddingTop: 4 }}>
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
          jobInfoMap={jobInfoMap}
          serverMeta={serverMeta}
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
          {Object.entries(CONFIG.STATUS_COLORS).filter(([s]) => s !== 'tentative').map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg,
                border: `1px solid ${c.border}`, display: 'inline-block' }}/>
              <span style={{ fontSize: 12, color: 'var(--cal-text-secondary)', textTransform: 'capitalize' }}>{s}</span>
            </div>
          ))}
          {['install','upgrade','pto','other'].map(t => {
            const c = CONFIG.TYPE_COLORS[t];
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg,
                  border: `1px solid ${c.border}`, display: 'inline-block' }}/>
                <span style={{ fontSize: 12, color: 'var(--cal-text-secondary)', textTransform: 'capitalize' }}>{t}</span>
              </div>
            );
          })}
          {/* Tentative ghost indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2,
              background: 'var(--cal-card)', border: '1px dashed var(--cal-text-muted)',
              display: 'inline-block' }}/>
            <span style={{ fontSize: 12, color: 'var(--cal-text-secondary)' }}>tentative</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', border: '0.5px solid var(--cal-border)', borderRadius: 8 }}>
        <table style={{
          borderCollapse: 'collapse', tableLayout: 'fixed',
          width: DATE_W + RESOURCE_TECHNICIANS.length * COL_W,
          minWidth: '100%',
        }}>
          <colgroup>
            <col style={{ width: DATE_W }}/>
            {RESOURCE_TECHNICIANS.map(t => <col key={t} style={{ width: COL_W }}/>)}
          </colgroup>

          <thead style={{ position: 'sticky', top: 0, zIndex: 4 }}>
            <tr style={{ background: 'var(--cal-header)' }}>
              <th style={{
                padding: '8px 10px', fontSize: 12, fontWeight: 500, color: 'var(--cal-text-muted)',
                textAlign: 'left', borderBottom: '0.5px solid var(--cal-border)',
                borderRight: '0.5px solid var(--cal-border)',
                position: 'sticky', left: 0, zIndex: 5, background: 'var(--cal-header)',
              }}>Date</th>
              {RESOURCE_TECHNICIANS.map((tech, i) => {
                const tc = CONFIG.TECH_COLORS?.[tech] || { bg: 'var(--cal-card)', fg: 'var(--cal-text)', border: 'var(--cal-border)' };
                return (
                  <th key={tech} style={{
                    padding: '8px 10px', fontSize: 13, fontWeight: 600,
                    color: tc.fg, textAlign: 'center',
                    borderBottom: `2px solid ${tc.border}`,
                    borderRight: i < RESOURCE_TECHNICIANS.length - 1 ? '0.5px solid var(--cal-border)' : 'none',
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
                : oddWeek ? 'var(--cal-week-tint)' : 'transparent';

              return (
                <tr key={ds} style={{ height: rowH, background: weekBg,
                  borderTop: isMon ? '1px solid var(--cal-border-week)' : undefined }}>
                    <td style={{
                      padding: '0 8px', fontSize: 12,
                      color: isToday ? 'var(--cal-success-text)' : isMon ? 'var(--cal-text-soft-alt)' : 'var(--cal-text-secondary)',
                      fontWeight: isToday || isMon ? 600 : 400,
                      borderBottom: '0.5px solid var(--cal-row-alt)',
                      borderRight: '0.5px solid var(--cal-border)',
                      borderTop: isMon ? '1px solid var(--cal-border-week)' : undefined,
                      boxShadow: isSep ? 'inset 0 2px 0 var(--cal-accent)' : undefined,
                      position: 'sticky', left: 0, zIndex: 2,
                      background: isToday ? 'var(--cal-today-bg)' : oddWeek ? 'var(--cal-week-alt)' : 'var(--cal-bg)',
                      whiteSpace: 'nowrap', verticalAlign: 'middle', height: rowH,
                    }}>
                      {isSep && (
                        <div style={{
                          fontSize: 12, fontWeight: 700, lineHeight: 1.1,
                          color: 'var(--cal-accent)', letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}>{format(d, 'MMM yyyy')}</div>
                      )}
                      <div style={{ lineHeight: 1.2 }}>
                        <span style={{ fontWeight: 600 }}>{format(d, 'EEE')} </span>
                        <span style={{ fontSize: 12 }}>{format(d, 'M/d')}</span>
                      </div>
                    </td>

                    {RESOURCE_TECHNICIANS.map((tech, ti) => {
                      const isLast       = ti === RESOURCE_TECHNICIANS.length - 1;
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
                            borderBottom: '0.5px solid var(--cal-row-alt)',
                            borderRight: !isLast ? '0.5px solid var(--cal-row-alt)' : 'none',
                            borderTop: isMon ? '1px solid var(--cal-border-week)' : undefined,
                            boxShadow: isSep ? 'inset 0 2px 0 var(--cal-accent)' : undefined,
                            cursor: editorToken && !activeOnDay.length && !techEvs.length ? 'pointer' : 'default',
                            padding: 0, verticalAlign: 'top',
                            background: isDropTarget ? 'rgba(58,123,213,0.15)' : 'transparent',
                            outline: isDropTarget ? '1.5px dashed var(--cal-accent)' : 'none',
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
                                    fontSize: 12, color: getTechEventColor(te).fg,
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
                            const accentColor = l.event.isGhost ? 'var(--cal-text-muted)' : (tc ? tc.fg : color.fg);
                            const showNotes   = l.event.notes && blockH > 30;
                            const isLocked    = String(l.event.id) === String(lockedEventId);
                            const isGhost     = l.event.isGhost;
                            const titleFontSize = eventTitleFontSize(blockH, l.event.title);
                            const statusLabel = isGhost ? 'tentative'
                              : l.event.event_type !== 'calibration'
                                ? l.event.event_type + (l.event.status ? ` · ${l.event.status}` : '')
                                : l.event.status || '';
                            const showStatus = statusLabel && blockH >= 45;
                            const showFooter = showNotes || showStatus;
                            const footerLines = showNotes && blockH >= 90 ? 2 : 1;
                            const footerSpace = showFooter ? (footerLines === 2 ? 34 : 20) : 4;

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
                                    ? '1px dashed var(--cal-text-faint)'
                                    : `0.5px solid ${color.border}`,
                                  borderLeft: isGhost
                                    ? '3px dashed var(--cal-text-muted)'
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
                                      fontSize: 12, color: color.fg, opacity: 0.7,
                                      fontWeight: 700,
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                                  >
                                    ℹ
                                  </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  overflow: 'hidden', minWidth: 0, minHeight: 0, flex: 1,
                                  padding: blockH >= 56
                                    ? `16px 2px ${footerSpace}px`
                                    : '2px 18px 2px 2px' }}>
                                  <span style={{ overflow: 'hidden', minWidth: 0,
                                    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 4,
                                    textAlign: 'center', lineHeight: 1.15,
                                    fontSize: titleFontSize, color: color.fg, fontWeight: 600 }}>
                                    {l.event.title}
                                  </span>
                                  {l.event.ticket_id && (
                                    <span style={{ position: 'absolute',
                                      top: 0, left: 0, marginLeft: 4, opacity: 0.55, fontSize: 12,
                                      flexShrink: 0, whiteSpace: 'nowrap', color: color.fg }}>
                                      #{l.event.ticket_id}
                                    </span>
                                  )}
                                </div>

                                {showFooter && (
                                  <div style={{
                                    position: 'absolute', left: 4, right: 4, bottom: 3,
                                    display: 'flex', alignItems: 'flex-end', gap: 6,
                                    minWidth: 0, color: color.fg, fontSize: 12, opacity: 0.5,
                                  }}>
                                    {showNotes && (
                                      <span title={l.event.notes} style={{
                                        flex: 1, minWidth: 0, overflow: 'hidden',
                                        display: '-webkit-box', WebkitBoxOrient: 'vertical',
                                        WebkitLineClamp: footerLines, lineHeight: 1.15,
                                        overflowWrap: 'anywhere',
                                      }}>
                                        {l.event.notes}
                                      </span>
                                    )}
                                    {showStatus && (
                                      <span style={{
                                        flexShrink: 0, maxWidth: '45%', overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      }}>
                                        {statusLabel}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          
                        </td>
                      );
                    })}
                    
                  </tr>
              );
              
            })}
          </tbody>
        </table>
      </div>

      {!editorToken && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--cal-text-muted)', textAlign: 'center', flexShrink: 0 }}>
          View only — click Editor login to make changes
        </div>
      )}
    </div>
  );
}
