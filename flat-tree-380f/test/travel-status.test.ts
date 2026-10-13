import { describe, expect, it } from 'vitest';
import { isTravelComplete } from '../src/travel-status';

describe('travel completion', () => {
  it('completes hotel and flight per technician and car with one completed entry', () => {
    const items = [
      { kind: 'hotel', technician: 'Alex', status: 'booked' },
      { kind: 'hotel', technician: 'Sam', status: 'not_needed' },
      { kind: 'flight', technician: 'Alex', status: 'not_needed' },
      { kind: 'flight', technician: 'Sam', status: 'booked' },
      { kind: 'car', technician: 'Alex', status: 'booked' },
    ];

    expect(isTravelComplete(['Alex', 'Sam'], items)).toBe(true);
  });

  it('lets a completed shared booking cover every assigned technician in its section', () => {
    const items = [
      { kind: 'hotel', technician: '', status: 'booked' },
      { kind: 'flight', technician: 'Alex', status: 'booked' },
      { kind: 'flight', technician: 'Sam', status: 'not_needed' },
      { kind: 'car', technician: '', status: 'not_needed' },
    ];

    expect(isTravelComplete(['Alex', 'Sam'], items)).toBe(true);
  });

  it('does not complete a hotel or flight section until every technician is covered', () => {
    const items = [
      { kind: 'hotel', technician: 'Alex', status: 'booked' },
      { kind: 'flight', technician: '', status: 'needed' },
      { kind: 'car', technician: 'Alex', status: 'booked' },
    ];

    expect(isTravelComplete(['Alex', 'Sam'], items)).toBe(false);
  });

  it('requires at least one completed car entry and at least one assigned technician', () => {
    const items = [
      { kind: 'hotel', technician: '', status: 'booked' },
      { kind: 'flight', technician: '', status: 'booked' },
      { kind: 'car', technician: 'Alex', status: 'needed' },
    ];

    expect(isTravelComplete(['Alex'], items)).toBe(false);
    expect(isTravelComplete([], [
      ...items,
      { kind: 'car', technician: 'Alex', status: 'booked' },
    ])).toBe(false);
  });
});
