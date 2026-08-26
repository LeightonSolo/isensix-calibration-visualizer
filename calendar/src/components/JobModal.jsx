import { useEffect, useMemo, useRef, useState } from 'react';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { CONFIG } from '../config';
import {
  findJobInfoMatch,
  filterJobInfoNames,
  getJobInfoNames,
  shouldUpdateAutofilledCustomer,
} from '../utils/jobInfoMatch';
import JobInfoPanel from './JobInfoPanel';
import {
  buildBusyDatesByTech,
  estimatedBusinessEndDate,
  fillAssignedTechnicians,
  withinEventDateRange,
  withoutAutomaticUnassigned,
} from '../utils/calendarAssignments.js';
import { notesForStatus } from '../utils/tentativeJobs.js';

const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--cal-panel)',
    border: '0.5px solid var(--cal-border)',
    borderRadius: 10,
    width: 'min(980px, 96vw)',
    height: 'min(860px, 94vh)',
    maxHeight: '94vh',
    overflow: 'hidden',
    display: 'flex',
  },
  formPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    padding: 24,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  title: { fontSize: 15, fontWeight: 600, color: 'var(--cal-text)' },
  label: { fontSize: 12, color: 'var(--cal-text-secondary)', textTransform: 'uppercase',
           letterSpacing: '0.04em', marginBottom: 4, display: 'block' },
  input: {
    background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
    borderRadius: 4, color: 'var(--cal-text)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '6px 10px', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  },
  jobPicker: { position: 'relative' },
  jobPickerArrow: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: 32,
    background: 'var(--cal-button-addon)', border: 0, borderLeft: '0.5px solid var(--cal-addon-border)',
    borderRadius: '0 4px 4px 0', color: 'var(--cal-text-secondary)', cursor: 'pointer',
    fontSize: 12,
  },
  jobOptions: {
    position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
    maxHeight: 230, overflowY: 'auto', zIndex: 20,
    background: 'var(--cal-menu)', border: '0.5px solid var(--cal-menu-border)', borderRadius: 5,
    boxShadow: '0 8px 24px rgba(0,0,0,0.55)', padding: 4,
  },
  jobOption: {
    display: 'block', width: '100%', padding: '7px 9px', textAlign: 'left',
    background: 'transparent', border: 0, borderRadius: 3,
    color: 'var(--cal-menu-text)', fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, cursor: 'pointer',
  },
  row: { display: 'flex', gap: 12 },
  col: { flex: 1, display: 'flex', flexDirection: 'column' },
  techGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
    marginTop: 4,
  },
  techBtn: (selected) => ({
    background: selected ? 'var(--cal-success-bg)' : 'var(--cal-input)',
    border: `0.5px solid ${selected ? 'var(--cal-success-border)' : 'var(--cal-border)'}`,
    borderRadius: 4,
    color: selected ? 'var(--cal-success-text)' : 'var(--cal-text-secondary)',
    fontSize: 12, padding: '5px 8px', cursor: 'pointer',
    fontFamily: 'Inter, system-ui, sans-serif',
  }),
  footer: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
  btn: {
    background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
    borderRadius: 4, color: 'var(--cal-text)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '6px 14px', cursor: 'pointer',
  },
  btnPrimary: {
    background: 'var(--cal-accent)', border: '0.5px solid var(--cal-accent)',
    borderRadius: 4, color: '#fff',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '6px 14px', cursor: 'pointer',
  },
  btnDanger: {
    background: 'var(--cal-danger-bg)', border: '0.5px solid var(--cal-danger-border)',
    borderRadius: 4, color: 'var(--cal-danger-text)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12, padding: '6px 14px', cursor: 'pointer',
    marginRight: 'auto',
  },
  divider: { borderTop: '0.5px solid var(--cal-border)', margin: '4px 0' },
};

export default function JobModal({
  event, initialDate, initialTech, onSave, onDelete, onClose,
  calendarAssignments = [], techEvents = [],
  jobInfoMap = {}, serverMeta = {},
}) {
  const isNew = !event?.id;

  const [title,      setTitle]      = useState(event?.title      || '');
  const [eventType,  setEventType]  = useState(event?.event_type || 'calibration');
  const [status,     setStatus]     = useState(event?.status     || 'ticketed');
  const [customer,   setCustomer]   = useState(event?.customer   || '');
  const [startDate,  setStartDate]  = useState(
    event?.start_date || (initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
  );
  const [endDate,    setEndDate]    = useState(
    event?.end_date   || (initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
  );
  const [ticketId,   setTicketId]   = useState(event?.ticket_id  || '');
  const [notes,      setNotes]      = useState(event?.notes      || '');
  const autofilledCustomerRef = useRef(null);
  const jobPickerRef = useRef(null);
  const [jobOptionsMode, setJobOptionsMode] = useState(null);

  // Tech assignments: { techName: Set of date strings }
  const [techDates, setTechDates] = useState(() => {
    const map = {};
    withoutAutomaticUnassigned(event?.assignments || []).forEach(a => {
      if (!map[a.tech_name]) map[a.tech_name] = new Set();
      map[a.tech_name].add(a.date);
    });
    if (!event?.assignments?.length && CONFIG.TECHNICIANS.includes(initialTech)) {
      map[initialTech] = new Set([startDate]);
    }
    return map;
  });

  const [saving, setSaving] = useState(false);
  const jobNames = getJobInfoNames(jobInfoMap);
  const visibleJobNames = filterJobInfoNames(jobNames, title, jobOptionsMode === 'all');
  const linkedJobInfo = event?.job_info_id
    ? Object.values(jobInfoMap).find(job => String(job.id) === String(event.job_info_id))
    : null;
  const matchedJobInfo = findJobInfoMatch(jobInfoMap, title) || linkedJobInfo;
  const busyDatesByTech = useMemo(
    () => buildBusyDatesByTech(calendarAssignments, techEvents, event?.id ?? null),
    [calendarAssignments, techEvents, event?.id]
  );

  useEffect(() => {
    function closeJobOptions(event) {
      if (!jobPickerRef.current?.contains(event.target)) setJobOptionsMode(null);
    }
    document.addEventListener('mousedown', closeJobOptions);
    return () => document.removeEventListener('mousedown', closeJobOptions);
  }, []);

  // Days in the selected range
  const days = (() => {
    try {
      return eachDayOfInterval({
        start: parseISO(startDate),
        end:   parseISO(endDate),
      }).filter(d => d.getDay() !== 0 && d.getDay() !== 6); // weekdays only
    } catch { return []; }
  })();

  function toggleTechDay(tech, dateStr) {
    setTechDates(prev => {
      const next = { ...prev };
      if (!next[tech]) next[tech] = new Set();
      else next[tech] = new Set(next[tech]);
      if (next[tech].has(dateStr)) next[tech].delete(dateStr);
      else next[tech].add(dateStr);
      return next;
    });
  }

  function toggleTechAllDays(tech) {
    setTechDates(prev => {
      const next = { ...prev };
      const dayStrs = days.map(d => format(d, 'yyyy-MM-dd'));
      const current = next[tech] || new Set();
      const allSelected = dayStrs.every(d => current.has(d));
      next[tech] = allSelected ? new Set() : new Set(dayStrs);
      return next;
    });
  }

  function autofillAssignedTechs(nextStartDate, nextEndDate) {
    setTechDates(previous => fillAssignedTechnicians(
      previous,
      nextStartDate,
      nextEndDate,
      busyDatesByTech,
    ));
  }

  function updateDateRange(nextStartDate, nextEndDate) {
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    autofillAssignedTechs(nextStartDate, nextEndDate);
  }

  async function handleSave() {
    if (!title.trim() || !startDate || !endDate) return;
    setSaving(true);
    // Build flat assignments array
    const selectedAssignments = [];
    Object.entries(techDates).forEach(([tech, dates]) => {
      dates.forEach(date => selectedAssignments.push({ tech_name: tech, date }));
    });
    const assignments = withinEventDateRange(selectedAssignments, startDate, endDate);
    try {
      await onSave({
        id: event?.id,
        isGhost: Boolean(event?.isGhost),
        job_info_id: matchedJobInfo?.id ?? event?.job_info_id ?? null,
        source_calibration_date: event?.source_calibration_date
          ?? event?.sourceJobInfo?.last_calibrated
          ?? null,
        title, event_type: eventType, status,
        customer: customer || null,
        start_date: startDate, end_date: endDate,
        ticket_id: ticketId || null,
        notes: notesForStatus(notes || null, status),
        assignments,
      });
      onClose();
    } catch(e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await onDelete(event.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const statusColor = CONFIG.STATUS_COLORS[status] || CONFIG.STATUS_COLORS.ticketed;
  const previewEventId = event?.id ?? '__job-modal-preview__';
  const previewAssignments = Object.entries(techDates).flatMap(([tech, dates]) =>
    [...dates].map(date => ({ event_id: previewEventId, tech_name: tech, date }))
  );
  const previewEvent = matchedJobInfo ? {
    id: previewEventId,
    title: matchedJobInfo.job_name,
    event_type: eventType,
    status,
    customer: customer || matchedJobInfo.customer || null,
    start_date: startDate,
    end_date: endDate,
    ticket_id: ticketId || null,
    notes: notes || null,
  } : null;

  function handleTitleChange(value, forceCustomerUpdate = false) {
    setTitle(value);
    const match = findJobInfoMatch(jobInfoMap, value);
    if (match?.customer && shouldUpdateAutofilledCustomer(
      customer,
      autofilledCustomerRef.current,
      forceCustomerUpdate,
    )) {
      setCustomer(match.customer);
      autofilledCustomerRef.current = match.customer;
    }
  }

  function selectJobName(jobName) {
    handleTitleChange(jobName, true);
    const selectedJob = findJobInfoMatch(jobInfoMap, jobName);
    const nextEndDate = estimatedBusinessEndDate(startDate, selectedJob?.estimated_days);
    setEndDate(nextEndDate);
    autofillAssignedTechs(startDate, nextEndDate);
    setJobOptionsMode(null);
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.formPane}>
          <div style={S.title}>{isNew ? 'New event' : 'Edit event'}</div>

        {/* Title */}
        <div>
          <label style={S.label}>Job / Event name *</label>
          <div ref={jobPickerRef} style={S.jobPicker}>
            <input style={{ ...S.input, paddingRight: 40 }} value={title}
              onChange={e => {
                handleTitleChange(e.target.value);
                setJobOptionsMode('filtered');
              }}
              onFocus={() => title && setJobOptionsMode('filtered')}
              onKeyDown={e => {
                if (e.key === 'Escape') setJobOptionsMode(null);
                if (e.key === 'ArrowDown') setJobOptionsMode('filtered');
              }}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(jobOptionsMode)}
              aria-controls="job-info-name-options"
              placeholder="e.g. Memorial Jacksonville, PTO" autoFocus/>
            <button type="button" style={S.jobPickerArrow}
              aria-label={jobOptionsMode === 'all' ? 'Close job list' : 'Show all jobs'}
              onClick={() => setJobOptionsMode(mode => mode === 'all' ? null : 'all')}>
              {jobOptionsMode === 'all' ? '▲' : '▼'}
            </button>
            {jobOptionsMode && (
              <div id="job-info-name-options" role="listbox" style={S.jobOptions}>
                {visibleJobNames.map(jobName => (
                  <button key={jobName} type="button" role="option"
                    aria-selected={jobName === matchedJobInfo?.job_name}
                    style={{
                      ...S.jobOption,
                      background: jobName === matchedJobInfo?.job_name ? 'var(--cal-selection)' : 'transparent',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--cal-selection-hover)'; }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background =
                        jobName === matchedJobInfo?.job_name ? 'var(--cal-selection)' : 'transparent';
                    }}
                    onClick={() => selectJobName(jobName)}>
                    {jobName}
                  </button>
                ))}
                {visibleJobNames.length === 0 && (
                  <div style={{ padding: '8px 9px', color: 'var(--cal-text-empty)', fontSize: 12 }}>
                    No matching jobs — this can still be used as a custom event name.
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cal-text-muted)', marginTop: 4 }}>
            Choose a suggested job to preview Job Info, or enter any event name.
          </div>
        </div>

        {/* Type + Status */}
        <div style={S.row}>
          <div style={S.col}>
            <label style={S.label}>Type</label>
            <select style={S.input} value={eventType}
              onChange={e => setEventType(e.target.value)}>
              {CONFIG.EVENT_TYPES.map(t =>
                <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
              )}
            </select>
          </div>
          <div style={S.col}>
            <label style={S.label}>Status</label>
            <select style={{ ...S.input, color: statusColor.fg,
              borderColor: statusColor.border, background: statusColor.bg }}
              value={status} onChange={e => {
                const nextStatus = e.target.value;
                // Keep the textarea controlled: React treats a null value as
                // uncontrolled and would leave the generated note visible.
                setNotes(notesForStatus(notes, nextStatus) || '');
                setStatus(nextStatus);
              }}>
              {CONFIG.EVENT_STATUSES.map(s =>
                <option key={s} value={s}
                  style={{ background: 'var(--cal-input)', color: 'var(--cal-text)' }}>
                  {s.charAt(0).toUpperCase()+s.slice(1)}
                </option>
              )}
            </select>
          </div>
        </div>

        {/* Customer + Ticket */}
        <div style={S.row}>
          <div style={S.col}>
            <label style={S.label}>Customer</label>
            <input style={S.input} value={customer}
              onChange={e => {
                setCustomer(e.target.value);
                autofilledCustomerRef.current = null;
              }}
              placeholder="Customer name"/>
          </div>
          <div style={S.col}>
            <label style={S.label}>Ticket ID</label>
            <input style={S.input} value={ticketId}
              onChange={e => setTicketId(e.target.value)}
              placeholder="e.g. 72956"/>
          </div>
        </div>

        {/* Dates */}
        <div style={S.row}>
          <div style={S.col}>
            <label style={S.label}>Start date *</label>
            <input style={S.input} type="date" value={startDate}
              onChange={e => {
                const nextStartDate = e.target.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(nextStartDate)) return;
                const nextEndDate = nextStartDate > endDate ? nextStartDate : endDate;
                updateDateRange(nextStartDate, nextEndDate);
              }}/>
          </div>
          <div style={S.col}>
            <label style={S.label}>End date *</label>
            <input style={S.input} type="date" value={endDate}
              min={startDate}
              onChange={e => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
                updateDateRange(startDate, e.target.value);
              }}/>
          </div>
        </div>

        {/* Tech assignment grid */}
        {days.length > 0 && (
          <div>
            <label style={S.label}>Technician assignment</label>
            <div style={{
              overflowX: 'auto',
              border: '0.5px solid var(--cal-border)',
              borderRadius: 6,
            }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 10px', fontSize: 12,
                      color: 'var(--cal-text-secondary)', textAlign: 'left',
                      borderBottom: '0.5px solid var(--cal-border)',
                      background: 'var(--cal-header)', width: 100 }}>Tech</th>
                    {days.map(d => (
                      <th key={d} style={{ padding: '6px 8px', fontSize: 12,
                        color: 'var(--cal-text-secondary)', textAlign: 'center',
                        borderBottom: '0.5px solid var(--cal-border)',
                        background: 'var(--cal-header)', whiteSpace: 'nowrap' }}>
                        {format(d, 'EEE M/d')}
                      </th>
                    ))}
                    <th style={{ padding: '6px 8px', fontSize: 12,
                      color: 'var(--cal-text-muted)', textAlign: 'center',
                      borderBottom: '0.5px solid var(--cal-border)',
                      background: 'var(--cal-header)' }}>All</th>
                  </tr>
                </thead>
                <tbody>
                  {CONFIG.TECHNICIANS.map(tech => {
                    const assigned = techDates[tech] || new Set();
                    const dayStrs  = days.map(d => format(d, 'yyyy-MM-dd'));
                    const allOn    = dayStrs.every(d => assigned.has(d));
                    return (
                      <tr key={tech}>
                        <td style={{ padding: '5px 10px', fontSize: 12,
                          color: 'var(--cal-text)', borderBottom: '0.5px solid var(--cal-row-alt)',
                          fontWeight: 500 }}>{tech}</td>
                        {days.map(d => {
                          const ds = format(d, 'yyyy-MM-dd');
                          const on = assigned.has(ds);
                          return (
                            <td key={ds} style={{ textAlign: 'center',
                              borderBottom: '0.5px solid var(--cal-row-alt)',
                              borderLeft: '0.5px solid var(--cal-row-alt)' }}>
                              <button onClick={() => toggleTechDay(tech, ds)}
                                style={{
                                  background: on ? 'var(--cal-success-bg)' : 'var(--cal-input)',
                                  border: `0.5px solid ${on ? 'var(--cal-success-border)' : 'var(--cal-border)'}`,
                                  borderRadius: 3, cursor: 'pointer',
                                  width: 24, height: 24, fontSize: 13,
                                  display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', margin: '3px auto',
                                }}>
                                {on ? '✓' : ''}
                              </button>
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center',
                          borderBottom: '0.5px solid var(--cal-row-alt)',
                          borderLeft: '0.5px solid var(--cal-border)' }}>
                          <button onClick={() => toggleTechAllDays(tech)}
                            style={{
                              background: allOn ? 'var(--cal-info-strong-bg)' : 'var(--cal-input)',
                              border: `0.5px solid ${allOn ? 'var(--cal-info-border-strong)' : 'var(--cal-border)'}`,
                              borderRadius: 3, cursor: 'pointer',
                              width: 24, height: 24, fontSize: 12,
                              color: allOn ? 'var(--cal-info-text)' : 'var(--cal-text-muted)',
                              margin: '3px auto', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                            }}>all</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label style={S.label}>Notes</label>
          <textarea style={{ ...S.input, resize: 'vertical' }}
            rows={3} value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional notes…"/>
        </div>

        <div style={S.divider}/>

        <div style={S.footer}>
          {!isNew && (
            <button style={S.btnDanger} onClick={handleDelete} disabled={saving}>
              Delete
            </button>
          )}
          <button style={S.btn} onClick={onClose}>Cancel</button>
          <button style={S.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create event' : 'Save changes'}
          </button>
        </div>
        </div>

        <JobInfoPanel
          selectedEvent={previewEvent}
          assignments={previewAssignments}
          locked={false}
          serverMeta={serverMeta}
          jobInfoOverride={matchedJobInfo}
          embedded
          heading="Scheduling info"
          emptyMessage={title.trim()
            ? 'No matching Job Info record. Choose a suggestion or continue with this custom event name.'
            : 'Start typing a job name to preview scheduling details.'}
        />
      </div>
    </div>
  );
}
