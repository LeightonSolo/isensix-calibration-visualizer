/** Renders the calendar-password dialog and returns an authorized token to the requested calendar action. */
import { useState } from 'react';
import { CONFIG } from '../config';

export default function EditorGate({ onUnlock, nameOnly = false, initialName = '' }) {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState(nameOnly ? 'name' : 'password');
  const [selectedName, setSelectedName] = useState(initialName || '');
  const [otherName, setOtherName] = useState('');
  const [token, setToken] = useState(null);

  function attemptPassword() {
    // We don't verify the token locally, the Worker will reject bad tokens.
    // Just store it and let the first write attempt fail if wrong.
    if (!input.trim()) return;
    const nextToken = input.trim();
    sessionStorage.setItem(CONFIG.CALENDAR_TOKEN_KEY, nextToken);
    setToken(nextToken);
    setPhase('name');
  }

  function attemptName() {
    const name = selectedName === 'Other' ? otherName.trim() : selectedName.trim();
    if (!name) return;
    onUnlock(token || sessionStorage.getItem(CONFIG.CALENDAR_TOKEN_KEY), name);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--cal-panel)',
        border: '0.5px solid var(--cal-border)',
        borderRadius: 10,
        padding: 28,
        width: 340,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        {phase === 'password' ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Calendar access</div>
            <div style={{ fontSize: 12, color: 'var(--cal-text-secondary)' }}>
              Enter the calendar password to create or modify calendar events.
            </div>
            <input
              type="password"
              placeholder="Calendar password"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && attemptPassword()}
              style={{
                background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
                borderRadius: 4, color: 'var(--cal-text)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 13, padding: '6px 10px', outline: 'none',
              }}
              autoFocus
            />
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Select User</div>
            <div style={{ fontSize: 12, color: 'var(--cal-text-secondary)' }}>
              Choose the person making calendar edits. This is used for edit history.
            </div>
            <select
              value={selectedName}
              onChange={e => setSelectedName(e.target.value)}
              autoFocus
              style={{
                background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
                borderRadius: 4, color: 'var(--cal-text)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 13, padding: '6px 10px', outline: 'none',
              }}
            >
              <option value="">Select User</option>
              <option value="Matt">Matt</option>
              <option value="Deyan">Deyan</option>
              <option value="Leighton">Leighton</option>
              <option value="Other">Other</option>
            </select>
            {selectedName === 'Other' && (
              <input
                type="text"
                placeholder="Enter name"
                value={otherName}
                onChange={e => setOtherName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && attemptName()}
                style={{
                  background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
                  borderRadius: 4, color: 'var(--cal-text)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 13, padding: '6px 10px', outline: 'none',
                }}
              />
            )}
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => onUnlock(null)} style={{
            background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
            borderRadius: 4, color: 'var(--cal-text)', fontSize: 12,
            padding: '5px 12px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={phase === 'password' ? attemptPassword : attemptName} style={{
            background: 'var(--cal-accent)', border: '0.5px solid var(--cal-accent)',
            borderRadius: 4, color: '#fff', fontSize: 12,
            padding: '5px 12px', cursor: 'pointer',
          }}>{phase === 'password' ? 'Unlock' : 'Continue'}</button>
        </div>
      </div>
    </div>
  );
}
