import { describe, expect, it } from 'vitest';
import {
  businessDateRange,
  tentativeAnniversaryMonday,
  tentativeEligibilityDate,
} from '../src/calendar-scheduling';

describe('calendar scheduling dates', () => {
  it('resets six calendar months after calibration and clamps month ends', () => {
    expect(tentativeEligibilityDate('2026-02-28')).toBe('2026-08-28');
    expect(tentativeEligibilityDate('2025-08-31')).toBe('2026-02-28');
  });

  it('targets the Monday on or before the annual anniversary', () => {
    expect(tentativeAnniversaryMonday('2025-08-21')).toBe('2026-08-17');
    expect(tentativeAnniversaryMonday('2024-02-29')).toBe('2025-02-24');
  });

  it('uses business days for the projected duration', () => {
    expect(businessDateRange('2026-08-21', 3)).toEqual([
      '2026-08-21',
      '2026-08-24',
      '2026-08-25',
    ]);
  });
});
