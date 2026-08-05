import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  addMonths, subMonths, format, addWeeks, getISOWeek,
  startOfWeek, endOfWeek, addDays, parseISO,
  differenceInCalendarDays, isMonday,
} from 'date-fns';
import { CONFIG } from './config';
import { useCalendarData } from './hooks/useCalendarData';
import ResourceGrid from './components/ResourceGrid';
import JobList from './components/JobList';
import EditorGate from './components/EditorGate';
import JobInfoPanel from './components/JobInfoPanel';

const STYLES = {
  app: {
    minHeight: '100vh',
    background: '#0e0e10',
    color: '#e8e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
  },
  topbar: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 20px',
    background: '#16161a',
    borderBottom: '0.5px solid #2a2a35',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  btn: {
    background: '#1e1e24', border: '0.5px solid #2a2a35',
    borderRadius: 4, color: '#e8e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 12px', cursor: 'pointer',
  },
  btnPrimary: {
    background: '#3a7bd5', border: '0.5px solid #3a7bd5',
    borderRadius: 4, color: '#fff',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 12px', cursor: 'pointer',
  },
  tabBtn: (active) => ({
    background: active ? '#1a1a22' : 'none',
    border: `0.5px solid ${active ? '#3a3a50' : '#2a2a35'}`,
    borderRadius: 6, color: active ? '#e8e8f0' : '#888899',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '5px 13px', cursor: 'pointer',
  }),
};



export default function App() {
  const [tab,           setTab]           = useState('grid');
  const [viewDate,      setViewDate]      = useState(new Date());
  const [editorToken,   setEditorToken]   = useState(
    sessionStorage.getItem(CONFIG.EDITOR_TOKEN_KEY) || null
  );
  const [showGate,      setShowGate]      = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Job info panel state
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [lockedEvent,  setLockedEvent]  = useState(null);

  const { events, assignments, techEvents, loading, error,
          load, saveEvent, deleteEvent,
          saveTechEvent, saveTechEventBatch, deleteTechEvent } = useCalendarData();

  const windowStart = startOfWeek(addMonths(viewDate, -1), { weekStartsOn: 1 });
  const windowEnd   = endOfWeek(addMonths(viewDate, 3),    { weekStartsOn: 1 });

  useEffect(() => {
    load(windowStart, windowEnd);
  }, [viewDate]);

  const [serverMeta, setServerMeta] = useState({});

  useEffect(() => {
    fetch(`${CONFIG.WORKER_URL}/servers`, { headers: { 'X-Api-Key': CONFIG.API_KEY } })
      .then(r => r.json())
      .then(rows => setServerMeta(Object.fromEntries(rows.map(r => [r.server, r]))))
      .catch(console.error);
  }, []);

  const [jobInfoMap, setJobInfoMap] = useState({});

  // Load all job info on mount
  useEffect(() => {
    fetch(`${CONFIG.WORKER_URL}/jobinfo/all`, { headers: { 'X-Api-Key': CONFIG.API_KEY } })
      .then(r => r.json())
      .then(rows => {
        const m = {};
        rows.forEach(ji => { if (ji.job_name) m[ji.job_name] = ji; });
        setJobInfoMap(m);
      })
      .catch(console.error);
  }, []);

  // Generate ghost events and merge with real events
  const ghostEvents = useMemo(
    () => generateGhostEvents(events, assignments, jobInfoMap),
    [events, assignments, jobInfoMap]
  );
  const ghostAssignments = useMemo(
    () => ghostEvents.flatMap(g => g.ghostAssignments || []),
    [ghostEvents]
  );
  const allEvents      = useMemo(() => [...events, ...ghostEvents],      [events, ghostEvents]);
  const allAssignments = useMemo(() => [...assignments, ...ghostAssignments], [assignments, ghostAssignments]);

  // Derived panel event: locked takes priority over hovered
  const panelEvent = lockedEvent || hoveredEvent;

  function requireEditor(action) {
    if (editorToken) { action(editorToken); return; }
    setPendingAction(() => action);
    setShowGate(true);
  }

  function handleUnlock(token) {
    setShowGate(false);
    if (!token) { setPendingAction(null); return; }
    setEditorToken(token);
    sessionStorage.setItem(CONFIG.EDITOR_TOKEN_KEY, token);
    if (pendingAction) { pendingAction(token); setPendingAction(null); }
  }

  function handleLock() {
    setEditorToken(null);
    sessionStorage.removeItem(CONFIG.EDITOR_TOKEN_KEY);
  }

  // When a ghost event is confirmed, save it as a real event
  async function handleSaveEvent(eventData, token) {
    if (eventData.isGhost) {
      // Save as new real event with tentative status
      const { isGhost, sourceEvent, ghostAssignments: ga, ...realData } = eventData;
      await saveEvent({ ...realData, id: undefined, status: 'tentative' }, token);
    } else {
      await saveEvent(eventData, token);
    }
    load(windowStart, windowEnd);
  }

  async function handleDeleteEvent(id, token) {
    // Ghost events can't be deleted from DB — just ignore
    if (String(id).startsWith('ghost-')) return;
    await deleteEvent(id, token);
    load(windowStart, windowEnd);
  }

  async function handleSaveTechEvent(data, token) {
    await saveTechEvent(data, token);
    load(windowStart, windowEnd);
  }

  async function handleSaveTechEventBatch(entries, token) {
    await saveTechEventBatch(entries, token);
    load(windowStart, windowEnd);
  }

  async function handleDeleteTechEvent(id, token) {
    await deleteTechEvent(id, token);
    load(windowStart, windowEnd);
  }

  // Panel hover/click handlers passed down to ResourceGrid
  function handleEventHover(event) {
    if (!lockedEvent) setHoveredEvent(event);
  }

  function handleEventHoverEnd() {
    if (!lockedEvent) setHoveredEvent(null);
  }

  function handleEventClick(event) {
  if (lockedEvent?.id === event?.id) {
    setLockedEvent(null);
  } else {
    setLockedEvent(event);
  }
}

function generateGhostEvents(events, assignments, jobInfoMap) {
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const fourMonthsOut = addMonths(now, 4); // wider window

  const ghosts = [];

  // Look at all booked/confirmed events, not just from last year
  const pastJobs = events.filter(e =>
    (e.status === 'booked' || e.status === 'confirmed') &&
    parseISO(e.start_date) < now
  );

  pastJobs.forEach(e => {
    // Get last_calibrated from job_info if available, fallback to event start_date
    const ji = jobInfoMap?.[e.title];
    const lastCalStr = ji?.last_calibrated || e.start_date;

    //console.log(e.title, ji?.last_calibrated);

    let lastCal;
    try { lastCal = parseISO(lastCalStr); }
    catch { return; }

    // Find the first Monday on or before lastCal's month/day in current year
    // Step 1: same month and day in current year
    const sameDay = new Date(currentYear, lastCal.getMonth(), lastCal.getDate());

    // Step 2: walk back to the nearest Monday
    let targetStart = new Date(sameDay);
    while (targetStart.getDay() !== 1) {
      targetStart = addDays(targetStart, -1);
    }

    // Step 3: if that date is in the past, try next year
    if (targetStart < now) {
      const sameDayNextYear = new Date(currentYear + 1, lastCal.getMonth(), lastCal.getDate());
      targetStart = new Date(sameDayNextYear);
      while (targetStart.getDay() !== 1) {
        targetStart = addDays(targetStart, -1);
      }
    }

            //console.log(`Generating ghost event for ${e.title} on ${format(targetStart, 'yyyy-MM-dd')}, based on last calibration ${format(lastCal, 'yyyy-MM-dd')}`);


    // Only show if within 4 months from now
    //if (targetStart > fourMonthsOut) return;



    // Duration from original event
    const origStart = parseISO(e.start_date);
    const origEnd   = parseISO(e.end_date);
    const duration  = Math.max(0, differenceInCalendarDays(origEnd, origStart));
    const targetEnd = addDays(targetStart, duration);

    // Check no real event already exists within 3 weeks for same title
    const conflict = events.some(ev =>
      ev.title === e.title &&
      !ev.isGhost &&
      Math.abs(differenceInCalendarDays(parseISO(ev.start_date), targetStart)) < 21
    );
    //if (conflict) return;


    // Copy assignments shifted to new dates
    const delta = differenceInCalendarDays(targetStart, origStart);
    const origAssignments = assignments.filter(a => String(a.event_id) === String(e.id));
    const ghostAssignments = origAssignments.map(a => ({
      tech_name: a.tech_name,
      date:      format(addDays(parseISO(a.date), delta), 'yyyy-MM-dd'),
      event_id:  `ghost-${e.id}`,
    }));


    ghosts.push({
      id:               `ghost-${e.id}`,
      title:            e.title,
      event_type:       e.event_type,
      status:           'tentative',
      customer:         e.customer,
      start_date:       format(targetStart, 'yyyy-MM-dd'),
      end_date:         format(targetEnd,   'yyyy-MM-dd'),
      ticket_id:        null,
      notes:            `Tentative — based on ${format(lastCal, 'MMM yyyy')} calibration`,
      isGhost:          true,
      sourceEvent:      e,
      ghostAssignments,
    });
    console.log(`Generated ghost event for ${e.title} on ${format(targetStart, 'yyyy-MM-dd')}`);
  });

  return ghosts;
}

  return (
    <div style={STYLES.app}>
      {showGate && <EditorGate onUnlock={handleUnlock} />}

      {/* Top bar */}
      <div style={STYLES.topbar}>
        <a href="../index.html"
          style={{ color: '#888899', fontSize: 12, textDecoration: 'none' }}>
          ← Dashboard
        </a>
        <span style={{ fontWeight: 600, fontSize: 14, marginRight: 8 }}>
          Isensix Calendar
        </span>

        <button style={STYLES.tabBtn(tab === 'grid')}  onClick={() => setTab('grid')}>📅 Schedule</button>
        <button style={STYLES.tabBtn(tab === 'list')}  onClick={() => setTab('list')}>📋 Job List</button>

        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          <button style={STYLES.btn} onClick={() => setViewDate(d => subMonths(d, 1))}>‹ Month</button>
          <button style={STYLES.btn} onClick={() => setViewDate(new Date())}>Today</button>
          <button style={STYLES.btn} onClick={() => setViewDate(d => addMonths(d, 1))}>Month ›</button>
        </div>

        <span style={{ fontSize: 12, color: '#888899' }}>{format(viewDate, 'MMMM yyyy')}</span>

        {loading && <span style={{ fontSize: 11, color: '#555566' }}>Loading…</span>}
        {error   && <span style={{ fontSize: 11, color: '#c83232' }}>{error}</span>}

        {ghostEvents.length > 0 && (
          <span style={{ fontSize: 11, color: '#c47a1a', marginLeft: 4 }}>
            {ghostEvents.length} tentative job{ghostEvents.length !== 1 ? 's' : ''} upcoming
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {editorToken ? (
            <>
              <span style={{ fontSize: 11, color: '#5a9e2f' }}>✓ Editor</span>
              <button style={STYLES.btn} onClick={handleLock}>Lock</button>
            </>
          ) : (
            <button style={STYLES.btn} onClick={() => setShowGate(true)}>
              🔒 Editor login
            </button>
          )}
        </div>
      </div>

      {/* Main content — grid/list + side panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: calendar or list */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 12px 12px 16px' }}>
          {tab === 'grid' && (
            <ResourceGrid
              viewDate={viewDate}
              events={allEvents}
              assignments={allAssignments}
              techEvents={techEvents}
              editorToken={editorToken}
              requireEditor={requireEditor}
              onSaveEvent={handleSaveEvent}
              onDeleteEvent={handleDeleteEvent}
              onSaveTechEvent={handleSaveTechEvent}
              onSaveTechEventBatch={handleSaveTechEventBatch}
              onDeleteTechEvent={handleDeleteTechEvent}
              onEventHover={handleEventHover}
              onEventHoverEnd={handleEventHoverEnd}
              onEventClick={handleEventClick}
              lockedEventId={lockedEvent?.id}
            />
          )}
          {tab === 'list' && (
            <JobList
              events={allEvents}
              assignments={allAssignments}
              techEvents={techEvents}
              editorToken={editorToken}
              requireEditor={requireEditor}
              onSaveEvent={handleSaveEvent}
              onDeleteEvent={handleDeleteEvent}
              onSaveTechEvent={handleSaveTechEvent}
              onSaveTechEventBatch={handleSaveTechEventBatch}
              onDeleteTechEvent={handleDeleteTechEvent}
              onEventClick={handleEventClick}
            />
          )}
        </div>

        {/* Right: job info panel — always visible */}
        <JobInfoPanel
          selectedEvent={panelEvent}
          assignments={allAssignments}
          locked={!!lockedEvent}
          serverMeta={serverMeta}
        />
      </div>
    </div>
  );
}