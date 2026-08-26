import { useState, useCallback } from 'react';
import { CONFIG } from '../config';
import { withoutAutomaticUnassigned } from '../utils/calendarAssignments.js';

function headers(editorToken) {
  const h = {
    'Content-Type': 'application/json',
    'X-Api-Key': CONFIG.API_KEY,
  };
  if (editorToken) h['X-Editor-Token'] = editorToken;
  return h;
}

export function useCalendarData() {
  const [events,      setEvents]      = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [techEvents,  setTechEvents]  = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const load = useCallback(async (startDate, endDate) => {
    setLoading(true);
    setError(null);
    try {
      const start = startDate.toISOString().slice(0, 10);
      const end   = endDate.toISOString().slice(0, 10);
      const [evRes, asRes, teRes] = await Promise.all([
        // Calendar events and assignments stay global so the Job List and
        // six-month tentative projections use the exact authoritative rows,
        // even when their dates are outside the visible grid window.
        fetch(`${CONFIG.WORKER_URL}/calendar/events`,
          { headers: headers() }),
        fetch(`${CONFIG.WORKER_URL}/calendar/assignments`,
          { headers: headers() }),
        fetch(`${CONFIG.WORKER_URL}/calendar/tech-events?start=${start}&end=${end}`,
          { headers: headers() }),
      ]);
      const [ev, as, te] = await Promise.all([
        evRes.json(), asRes.json(), teRes.json()
      ]);
      setEvents(ev);
      setAssignments(withoutAutomaticUnassigned(as));
      setTechEvents(te);
    } catch(e) {
      setError('Failed to load calendar data');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveEvent = useCallback(async (eventData, editorToken) => {
    const res = await fetch(`${CONFIG.WORKER_URL}/calendar/events`, {
      method: 'POST',
      headers: headers(editorToken),
      body: JSON.stringify(eventData),
    });
    if (!res.ok) throw new Error('Failed to save event');
    return res.json();
  }, []);

  const deleteEvent = useCallback(async (id, editorToken) => {
    const res = await fetch(`${CONFIG.WORKER_URL}/calendar/events/${id}`, {
      method: 'DELETE',
      headers: headers(editorToken),
    });
    if (!res.ok) throw new Error('Failed to delete event');
    return res.json();
  }, []);

  const saveTechEvent = useCallback(async (techEventData, editorToken) => {
    const res = await fetch(`${CONFIG.WORKER_URL}/calendar/tech-events`, {
      method: 'POST',
      headers: headers(editorToken),
      body: JSON.stringify(techEventData),
    });
    if (!res.ok) throw new Error('Failed to save tech event');
    return res.json();
  }, []);

  const deleteTechEvent = useCallback(async (id, editorToken) => {
    const res = await fetch(`${CONFIG.WORKER_URL}/calendar/tech-events/${id}`, {
      method: 'DELETE',
      headers: headers(editorToken),
    });
    if (!res.ok) throw new Error('Failed to delete tech event');
    return res.json();
  }, []);

  const saveTechEventBatch = useCallback(async (entries, editorToken) => {
    const res = await fetch(`${CONFIG.WORKER_URL}/calendar/tech-events/batch`, {
      method: 'POST',
      headers: headers(editorToken),
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) throw new Error('Failed to save tech events');
    return res.json();
  }, []);

  return {
    events, assignments, techEvents,
    loading, error,
    load, saveEvent, deleteEvent,
    saveTechEvent, deleteTechEvent, saveTechEventBatch,
  };
}
