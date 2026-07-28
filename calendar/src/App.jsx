import { useState, useEffect, useCallback } from 'react';
import { addMonths, subMonths, startOfMonth, endOfMonth,
         addWeeks, subWeeks, startOfWeek, endOfWeek, format } from 'date-fns';
import { CONFIG } from './config';
import { useCalendarData } from './hooks/useCalendarData';
import ResourceGrid from './components/ResourceGrid';
import JobList from './components/JobList';
import EditorGate from './components/EditorGate';

const STYLES = {
  app: {
    minHeight: '100vh',
    background: '#0e0e10',
    color: '#e8e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
  },
  topbar: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 20px',
    background: '#16161a',
    borderBottom: '0.5px solid #2a2a35',
    flexWrap: 'wrap',
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
  btnActive: {
    background: '#1a1a22', border: '0.5px solid #3a3a50',
    borderRadius: 4, color: '#e8e8f0',
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
  const [tab,          setTab]          = useState('grid');
  const [viewDate,     setViewDate]     = useState(new Date());
  const [editorToken,  setEditorToken]  = useState(
    sessionStorage.getItem(CONFIG.EDITOR_TOKEN_KEY) || null
  );
  const [showGate,     setShowGate]     = useState(false);
  const [pendingAction,setPendingAction]= useState(null);

  const { events, assignments, techEvents, loading, error,
          load, saveEvent, deleteEvent,
          saveTechEvent, deleteTechEvent } = useCalendarData();

  // Window: show 8 weeks centered on viewDate
  const windowStart = startOfWeek(subWeeks(viewDate, 2), { weekStartsOn: 1 });
  const windowEnd   = endOfWeek(addWeeks(viewDate, 8),   { weekStartsOn: 1 });

  useEffect(() => {
    load(windowStart, windowEnd);
  }, [viewDate]);

  function requireEditor(action) {
    if (editorToken) { action(editorToken); return; }
    setPendingAction(() => action);
    setShowGate(true);
  }

  function handleUnlock(token) {
    setShowGate(false);
    if (!token) { setPendingAction(null); return; }
    setEditorToken(token);
    if (pendingAction) { pendingAction(token); setPendingAction(null); }
  }

  function handleLock() {
    setEditorToken(null);
    sessionStorage.removeItem(CONFIG.EDITOR_TOKEN_KEY);
  }

  async function handleSaveEvent(eventData, token) {
    await saveEvent({ ...eventData }, token);
    load(windowStart, windowEnd);
  }

  async function handleDeleteEvent(id, token) {
    await deleteEvent(id, token);
    load(windowStart, windowEnd);
  }

  async function handleSaveTechEvent(data, token) {
    await saveTechEvent(data, token);
    load(windowStart, windowEnd);
  }

  async function handleDeleteTechEvent(id, token) {
    await deleteTechEvent(id, token);
    load(windowStart, windowEnd);
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

        {/* Tab switcher */}
        <button style={STYLES.tabBtn(tab==='grid')}
          onClick={() => setTab('grid')}>📅 Schedule</button>
        <button style={STYLES.tabBtn(tab==='list')}
          onClick={() => setTab('list')}>📋 Job List</button>

        {/* Navigation */}
        <div style={{ display:'flex', gap:6, marginLeft:8 }}>
          <button style={STYLES.btn}
            onClick={() => setViewDate(d => subMonths(d, 1))}>‹ Month</button>
          <button style={STYLES.btn}
            onClick={() => setViewDate(new Date())}>Today</button>
          <button style={STYLES.btn}
            onClick={() => setViewDate(d => addMonths(d, 1))}>Month ›</button>
        </div>

        <span style={{ fontSize: 12, color: '#888899' }}>
          {format(viewDate, 'MMMM yyyy')}
        </span>

        {loading && (
          <span style={{ fontSize: 11, color: '#555566' }}>Loading…</span>
        )}
        {error && (
          <span style={{ fontSize: 11, color: '#c83232' }}>{error}</span>
        )}

        <div style={{ marginLeft: 'auto', display:'flex', gap:8, alignItems:'center' }}>
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
          <button style={STYLES.btnPrimary}
            onClick={() => requireEditor(token =>
              setTab('grid') // handled in ResourceGrid via onCreateRequest
            )}>
            + Add event
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ padding: '16px 20px' }}>
        {tab === 'grid' && (
          <ResourceGrid
            viewDate={viewDate}
            events={events}
            assignments={assignments}
            techEvents={techEvents}
            editorToken={editorToken}
            requireEditor={requireEditor}
            onSaveEvent={handleSaveEvent}
            onDeleteEvent={handleDeleteEvent}
            onSaveTechEvent={handleSaveTechEvent}
            onDeleteTechEvent={handleDeleteTechEvent}
          />
        )}
        {tab === 'list' && (
          <JobList
            events={events}
            assignments={assignments}
            editorToken={editorToken}
            requireEditor={requireEditor}
            onSaveEvent={handleSaveEvent}
            onDeleteEvent={handleDeleteEvent}
          />
        )}
      </div>
    </div>
  );
}