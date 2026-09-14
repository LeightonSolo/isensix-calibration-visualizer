/** Renders the calendar-password dialog and returns an authorized token to the requested calendar action. */
import { useState } from 'react';
import { CONFIG } from '../config';

export default function EditorGate({ onUnlock }) {
  const [input, setInput] = useState('');

  function attempt() {
    // We don't verify the token locally, the Worker will reject bad tokens.
    // Just store it and let the first write attempt fail if wrong.
    if (!input.trim()) return;
    sessionStorage.setItem(CONFIG.CALENDAR_TOKEN_KEY, input.trim());
    onUnlock(input.trim());
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
        <div style={{ fontSize: 15, fontWeight: 600 }}>Calendar access</div>
        <div style={{ fontSize: 12, color: 'var(--cal-text-secondary)' }}>
          Enter the calendar password to create or modify calendar events.
        </div>
        <input
          type="password"
          placeholder="Calendar password"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          style={{
            background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
            borderRadius: 4, color: 'var(--cal-text)',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13, padding: '6px 10px', outline: 'none',
          }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => onUnlock(null)} style={{
            background: 'var(--cal-input)', border: '0.5px solid var(--cal-border)',
            borderRadius: 4, color: 'var(--cal-text)', fontSize: 12,
            padding: '5px 12px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={attempt} style={{
            background: 'var(--cal-accent)', border: '0.5px solid var(--cal-accent)',
            borderRadius: 4, color: '#fff', fontSize: 12,
            padding: '5px 12px', cursor: 'pointer',
          }}>Unlock</button>
        </div>
      </div>
    </div>
  );
}
