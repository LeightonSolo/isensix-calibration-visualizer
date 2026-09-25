/** Displays and edits shared hotel, rental-car, and flight details for a job. */
import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from '../config.js';
import { siteHeaders, siteToken } from '../utils/siteAuth.js';

const KINDS = [
  { key: 'flight', label: 'Flights', icon: '✈' },
  { key: 'hotel', label: 'Hotel', icon: '🏨' },
  { key: 'car', label: 'Rental car', icon: '🚗' },
 
];

const EMPTY_ITEM = kind => ({ kind, technician: '', status: 'needed', details: '', notes: '' });
const TRAVEL_STATUS_COLORS = {
  needed: CONFIG.TYPE_COLORS.pto,
  booked: CONFIG.STATUS_COLORS.booked,
  not_needed: CONFIG.STATUS_COLORS.confirmed,
};
const NEUTRAL_TECH_COLOR = {
  bg: 'var(--cal-input)',
  fg: 'var(--cal-text)',
  border: 'var(--cal-border-strong)',
};

function colorStyle(colors) {
  return colors ? {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    color: colors.fg,
  } : undefined;
}

function statusLabel(status) {
  return status === 'booked' ? 'Booked' : status === 'not_needed' ? 'Not needed' : 'Needs booking';
}

function TravelItemEditor({ item, onChange, onRemove }) {
  const knownTechnicians = ['', ...CONFIG.TECHNICIANS];
  const manualTechnician = Boolean(item.manual || (item.technician && !knownTechnicians.includes(item.technician)));
  const [showExtra, setShowExtra] = useState(Boolean(item.details || item.notes));

  function updateTechnician(value) {
    if (value === '__manual__') {
      onChange({ manual: true, technician: '' });
      return;
    }
    onChange({
      manual: false,
      technician: value,
      ...(value && item.status === 'needed' ? { status: 'booked' } : {}),
    });
  }

  return (
    <div className="travel-item-editor">
      <div className="travel-editor-row">
        <select value={manualTechnician ? '__manual__' : (item.technician || '')}
          style={colorStyle(manualTechnician || !item.technician
            ? NEUTRAL_TECH_COLOR
            : CONFIG.TECH_COLORS?.[item.technician])}
          aria-label="Technician or shared booking" onChange={event => updateTechnician(event.target.value)}>
          <option value="" style={colorStyle(NEUTRAL_TECH_COLOR)}>Shared booking</option>
          {CONFIG.TECHNICIANS.map(technician => (
            <option key={technician} value={technician} style={colorStyle(CONFIG.TECH_COLORS?.[technician])}>
              {technician}
            </option>
          ))}
          <option value="__manual__" style={colorStyle(NEUTRAL_TECH_COLOR)}>Manual override…</option>
        </select>
        <select value={item.status || 'needed'} style={colorStyle(TRAVEL_STATUS_COLORS[item.status || 'needed'])}
          aria-label="Travel status"
          onChange={event => onChange({ status: event.target.value })}>
          {['needed', 'booked', 'not_needed'].map(status => (
            <option key={status} value={status} style={colorStyle(TRAVEL_STATUS_COLORS[status])}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
        <button type="button" className="travel-remove" onClick={onRemove} aria-label="Remove booking">×</button>
      </div>
      {manualTechnician && (
        <input value={item.technician || ''} placeholder="Enter technician name"
          aria-label="Manual technician name"
          onChange={event => onChange({
            manual: true,
            technician: event.target.value,
            ...(event.target.value && item.status === 'needed' ? { status: 'booked' } : {}),
          })} />
      )}
      <button type="button" className="travel-extra-toggle" onClick={() => setShowExtra(current => !current)}>
        {showExtra ? 'Hide details' : (item.details || item.notes ? 'Edit details' : '+ details / notes')}
      </button>
      {showExtra && <>
        <input value={item.details || ''} placeholder="Booking details"
          onChange={event => onChange({ details: event.target.value })} />
        <textarea rows={2} value={item.notes || ''} placeholder="Optional notes"
          onChange={event => onChange({ notes: event.target.value })} />
      </>}
    </div>
  );
}

export default function TravelPanel({ jobInfo, event, onTravelSaved }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const editable = Boolean(siteToken());
  const grouped = useMemo(() => KINDS.map(kind => ({
    ...kind,
    items: items.filter(item => item.kind === kind.key),
  })), [items]);

  useEffect(() => {
    let cancelled = false;
    setMessage('');
    if (!jobInfo?.id) {
      setItems([]);
      return undefined;
    }
    setLoading(true);
    fetch(`${CONFIG.WORKER_URL}/calendar/travel?job_info_id=${encodeURIComponent(jobInfo.id)}`, {
      headers: siteHeaders(),
    })
      .then(response => {
        if (!response.ok) throw new Error('Could not load travel information.');
        return response.json();
      })
      .then(data => { if (!cancelled) setItems(Array.isArray(data) ? data : []); })
      .catch(error => { if (!cancelled) setMessage(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobInfo?.id]);

  function updateItem(index, updates) {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item));
  }

  function addItem(kind) {
    setItems(current => [...current, EMPTY_ITEM(kind)]);
  }

  function removeItem(index) {
    setItems(current => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function save() {
    if (!jobInfo?.id) return;
    setSaving(true);
    setMessage('Saving…');
    try {
      const response = await fetch(`${CONFIG.WORKER_URL}/calendar/travel`, {
        method: 'POST',
        headers: siteHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ job_info_id: jobInfo.id, event_id: event?.id ?? null, items }),
      });
      if (!response.ok) throw new Error(response.status === 403 ? 'Site access required.' : 'Could not save travel information.');
      const result = await response.json();
      onTravelSaved?.(result);
      setMessage('Saved');
    } catch (error) {
      setMessage(error.message || 'Could not save travel information.');
    } finally {
      setSaving(false);
    }
  }

  if (!jobInfo?.id) return <div className="travel-empty-panel">Travel can be added after this event is linked to a Job Info record.</div>;
  if (loading) return <div className="travel-empty-panel">Loading travel information…</div>;

  return (
    <div className="travel-panel">
      <div className="travel-help">Shared travel details for this job.</div>
      {grouped.map(kind => (
        <section className="travel-card" key={kind.key}>
          <div className="travel-card-heading">
            <strong>{kind.icon} {kind.label}<span className="travel-booked-count">: {kind.items.filter(item => item.status === 'booked').length} Booked</span></strong>
            {editable && <button type="button" onClick={() => addItem(kind.key)}>+ booking</button>}
          </div>
          {kind.items.length ? kind.items.map(item => {
            const index = items.indexOf(item);
            return editable ? (
              <TravelItemEditor key={`${kind.key}-${index}`} item={item}
                onChange={updates => updateItem(index, updates)} onRemove={() => removeItem(index)} />
            ) : (
              <div className="travel-item-readonly" key={`${kind.key}-${index}`}>
                <b>{item.technician || 'Shared'} · {statusLabel(item.status)}</b>
                <span>{item.details || 'No booking details'}</span>
                {item.notes && <small>{item.notes}</small>}
              </div>
            );
          }) : <div className="travel-empty">No travel information added.</div>}
        </section>
      ))}
      {editable && (
        <div className="travel-save-row">
          <span className={`travel-message${message && message !== 'Saved' ? ' travel-error' : ''}`}>{message}</span>
          <button type="button" className="travel-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save travel'}</button>
        </div>
      )}
    </div>
  );
}
