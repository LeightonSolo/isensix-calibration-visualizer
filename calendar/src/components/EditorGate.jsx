import { useState } from 'react';
import { CONFIG } from '../config';

export default function EditorGate({ onUnlock }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  function attempt() {
    // We don't verify the token locally — the Worker will reject bad tokens.
    // Just store it and let the first write attempt fail if wrong.
    if (!input.trim()) return;
    sessionStorage.setItem(CONFIG.EDITOR_TOKEN_KEY, input.trim());
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
        background: '#16161a',
        border: '0.5px solid #2a2a35',
        borderRadius: 10,
        padding: 28,
        width: 340,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Editor access</div>
        <div style={{ fontSize: 12, color: '#888899' }}>
          Enter the editor password to create or modify events.
        </div>
        <input
          type="password"
          placeholder="Editor password"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          style={{
            background: '#1e1e24', border: '0.5px solid #2a2a35',
            borderRadius: 4, color: '#e8e8f0',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13, padding: '6px 10px', outline: 'none',
          }}
          autoFocus
        />
        {error && (
          <div style={{ fontSize: 12, color: '#c83232' }}>
            Incorrect password
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => onUnlock(null)} style={{
            background: '#1e1e24', border: '0.5px solid #2a2a35',
            borderRadius: 4, color: '#e8e8f0', fontSize: 12,
            padding: '5px 12px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={attempt} style={{
            background: '#3a7bd5', border: '0.5px solid #3a7bd5',
            borderRadius: 4, color: '#fff', fontSize: 12,
            padding: '5px 12px', cursor: 'pointer',
          }}>Unlock</button>
        </div>
      </div>
    </div>
  );
}