import { describe, it, expect } from 'vitest';
import { matchesSearch } from '../src/utils/searchMatch';

describe('matchesSearch multi-token substring matching', () => {
  it('matches middle and end substrings, not just the first letter', () => {
    expect(matchesSearch('struct', 'Mugisha Construction Ltd', '0788123456')).toBe(true);
    expect(matchesSearch('ltd', 'Mugisha Construction Ltd', '0788123456')).toBe(true);
    expect(matchesSearch('2345', 'Mugisha Construction Ltd', '0788123456')).toBe(true);
  });

  it('matches multiple words across fields regardless of order or casing', () => {
    expect(matchesSearch('mugisha 456', 'Mugisha Construction Ltd', '0788123456', 'TIN-9001')).toBe(true);
    expect(matchesSearch('0788 kigali cement', 'Cement 50kg Kigali', 'SKU-099', '0788999111')).toBe(true);
  });

  it('supports editing / deleting characters (progressive backspace narrowing & widening)', () => {
    const customers = [
      { name: 'Kigali Builders Ltd', phone: '0788111222' },
      { name: 'Rwanda Steel Works', phone: '0788333444' },
      { name: 'Kimironko Hardware', phone: '0722555666' },
    ];

    // Mistyped word yields 0 matches
    const typo = customers.filter((c) => matchesSearch('kigalx', c.name, c.phone));
    expect(typo).toHaveLength(0);

    // Backspace deletes wrong character ('kigal') without closing search
    const corrected = customers.filter((c) => matchesSearch('kigal', c.name, c.phone));
    expect(corrected).toHaveLength(1);
    expect(corrected[0].name).toBe('Kigali Builders Ltd');

    // Deleting back further ('ki') widens to both Kigali and Kimironko
    const widened = customers.filter((c) => matchesSearch('ki', c.name, c.phone));
    expect(widened.map((c) => c.name)).toEqual(['Kigali Builders Ltd', 'Kimironko Hardware']);
  });

  it('handles empty queries and null/undefined fields gracefully', () => {
    expect(matchesSearch('', 'Anything', null, undefined)).toBe(true);
    expect(matchesSearch('   ', 'Anything', null)).toBe(true);
    expect(matchesSearch('abc', null, undefined)).toBe(false);
    expect(matchesSearch('1042', 'ORD-2026-1042', null, 1042)).toBe(true);
  });

  it('requires all space-separated tokens to match', () => {
    expect(matchesSearch('cement 50kg', 'Cimerwa Cement 50kg Bag', 'CEM-50')).toBe(true);
    expect(matchesSearch('cement 25kg', 'Cimerwa Cement 50kg Bag', 'CEM-50')).toBe(false);
  });
});
