/** Resolves keyboard shortcuts to the appropriate calendar event status. */

export function statusForShortcut(event, key) {
  if (!event || event.isGhost) return null;

  switch (String(key || '').toLowerCase()) {
    case 'b': return 'booked';
    case 'c': return 'confirmed';
    case 't': return String(event.ticket_id || '').trim() ? 'ticketed' : 'tentative';
    default: return null;
  }
}
