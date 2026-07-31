import { useState } from 'react';
import { format, eachDayOfInterval, parseISO, isWeekend } from 'date-fns';
import { CONFIG } from '../config';

const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#16161a', border: '0.5px solid #2a2a35',
    borderRadius: 10, padding: 24, width: 500, maxWidth: '95vw',
    maxHeight: '90vh', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  title:  { fontSize: 15, fontWeight: 600, color: '#e8e8f0' },
  label:  { fontSize: 11, color: '#888899', textTransform: 'uppercase',
            letterSpacing: '0.04em', marginBottom: 4, display: 'block' },
  input:  {
    background: '#1e1e24', border: '0.5px solid #2a2a35',
    borderRadius: 4, color: '#e8e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '6px 10px', outline: 'none', width: '100%',
  },
  row:    { display: 'flex', gap: 12 },
  col:    { flex: 1, display: 'flex', flexDirection: 'column' },
  footer: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
  btn: {
    background: '#1e1e24', border: '0.5px solid #2a2a35',
    borderRadius: 4, color: '#e8e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '6px 14px', cursor: 'pointer',
  },
  btnPrimary: {
    background: '#3a7bd5', border: '0.5px solid #3a7bd5',
    borderRadius: 4, color: '#fff',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '6px 14px', cursor: 'pointer',
  },
  btnDanger: {
    background: '#2e1010', border: '0.5px solid #6e2020',
    borderRadius: 4, color: '#d46060',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '6px 14px', cursor: 'pointer',
    marginRight: 'auto',
  },
  divider: { borderTop: '0.5px solid #2a2a35', margin: '4px 0' },
};

const TYPE_LABELS = {
  pto:       'PTO',
  holiday:   'Holiday',
  jury_duty: 'Jury Duty',
  office:    'Office',
  other:     'Other',
};

export default function TechEventModal({
  techEvent, initialDate, initialTech,
  onSave, onSaveBatch, onDelete, onClose,
}) {
  const isEdit = !!techEvent?.id;

  const [eventType, setEventType] = useState(techEvent?.event_type || 'pto');
  const [startDate, setStartDate] = useState(
    techEvent?.date || (initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
  );
  const [endDate, setEndDate] = useState(
    techEvent?.date || (initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
  );
  const [notes,   setNotes]   = useState(techEvent?.notes || '');
  const [saving,  setSaving]  = useState(false);

  // Selected techs — default to initialTech or all
  const [selectedTechs, setSelectedTechs] = useState(
    new Set(isEdit ? [techEvent.tech_name] : (initialTech ? [initialTech] : []))
  );

  function toggleTech(tech) {
    setSelectedTechs(prev => {
      const next = new Set(prev);
      if (next.has(tech)) next.delete(tech);
      else next.add(tech);
      return next;
    });
  }

  function toggleAllTechs() {
    if (selectedTechs.size === CONFIG.TECHNICIANS.length) {
      setSelectedTechs(new Set());
    } else {
      setSelectedTechs(new Set(CONFIG.TECHNICIANS));
    }
  }

  // Compute days in range (weekdays only)
  const days = (() => {
    try {
      return eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
        .filter(d => !isWeekend(d));
    } catch { return []; }
  })();

  async function handleSave() {
    if (!selectedTechs.size || !days.length) return;
    setSaving(true);
    try {
      if (isEdit) {
        // Single edit — just update the one record
        await onSave({
          id: techEvent.id,
          tech_name: techEvent.tech_name,
          event_type: eventType,
          date: techEvent.date,
          notes: notes || null,
        });
      } else {
        // Batch create — one entry per tech per day
        const entries = [];
        days.forEach(d => {
          selectedTechs.forEach(tech => {
            entries.push({
              tech_name:  tech,
              event_type: eventType,
              date:       format(d, 'yyyy-MM-dd'),
              notes:      notes || null,
            });
          });
        });
        await onSaveBatch(entries);
      }
      onClose();
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm('Remove this event?')) return;
    setSaving(true);
    try { await onDelete(techEvent.id); onClose(); }
    finally { setSaving(false); }
  }

  const typeColor = CONFIG.TYPE_COLORS[eventType] || CONFIG.TYPE_COLORS.other;
  const allSelected = selectedTechs.size === CONFIG.TECHNICIANS.length;

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.title}>{isEdit ? 'Edit event' : 'Add PTO / Holiday / Other'}</div>

        {/* Type */}
        <div>
          <label style={S.label}>Type</label>
          <select style={{
            ...S.input,
            color: typeColor.fg,
            borderColor: typeColor.border,
            background: typeColor.bg,
          }} value={eventType} onChange={e => setEventType(e.target.value)}>
            {CONFIG.TECH_EVENT_TYPES.map(t => (
              <option key={t} value={t} style={{ background: '#1e1e24', color: '#e8e8f0' }}>
                {TYPE_LABELS[t] || t}
              </option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div style={S.row}>
          <div style={S.col}>
            <label style={S.label}>Start date</label>
            <input style={S.input} type="date" value={startDate}
              disabled={isEdit}
              onChange={e => {
                setStartDate(e.target.value);
                if (e.target.value > endDate) setEndDate(e.target.value);
              }}/>
          </div>
          <div style={S.col}>
            <label style={S.label}>End date</label>
            <input style={S.input} type="date" value={endDate}
              min={startDate}
              disabled={isEdit}
              onChange={e => setEndDate(e.target.value)}/>
          </div>
        </div>

        {/* Days preview */}
        {!isEdit && days.length > 0 && (
          <div style={{ fontSize: 11, color: '#888899' }}>
            {days.length} weekday{days.length !== 1 ? 's' : ''}:&nbsp;
            {days.map(d => format(d, 'EEE M/d')).join(', ')}
          </div>
        )}

        {/* Tech selection */}
        {/* In edit mode: show tech name as read-only. In create mode: show selector */}
        {isEdit ? (
          <div>
            <label style={S.label}>Technician</label>
            <div style={{
              ...S.input,
              color: '#e8e8f0',
              opacity: 0.7,
              cursor: 'default',
            }}>
              {techEvent.tech_name}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...S.label, marginBottom: 0 }}>Technicians</label>
              <button onClick={toggleAllTechs} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: '#3a7bd5', padding: 0,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {CONFIG.TECHNICIANS.map(tech => {
                const tc       = CONFIG.TECH_COLORS?.[tech];
                const selected = selectedTechs.has(tech);
                return (
                  <button key={tech} onClick={() => toggleTech(tech)} style={{
                    background: selected ? (tc?.bg || '#1a2e14') : '#1e1e24',
                    border: `0.5px solid ${selected ? (tc?.border || '#3a6e2a') : '#2a2a35'}`,
                    borderRadius: 4,
                    color: selected ? (tc?.fg || '#7ec85a') : '#888899',
                    fontSize: 12, padding: '5px 8px', cursor: 'pointer',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    textAlign: 'center',
                  }}>{tech}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label style={S.label}>Notes</label>
          <input style={S.input} value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes"/>
        </div>

        <div style={S.divider}/>

        <div style={S.footer}>
          {isEdit && (
            <button style={S.btnDanger} onClick={handleDelete} disabled={saving}>
              Remove
            </button>
          )}
          <button style={S.btn} onClick={onClose}>Cancel</button>
          <button style={S.btnPrimary} onClick={handleSave}
            disabled={saving || (!isEdit && (!selectedTechs.size || !days.length))}>
            {saving ? 'Saving…' : isEdit ? 'Save' : `Add ${days.length * selectedTechs.size} event${days.length * selectedTechs.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}