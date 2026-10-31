import { isoWeekKey, shiftWeek, weekRange } from './week';

describe('isoWeekKey', () => {
  it('uses the week of the Thursday, so early January can belong to the previous year', () => {
    expect(isoWeekKey(new Date(2026, 9, 28))).toBe('2026-W44');
    expect(isoWeekKey(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeekKey(new Date(2025, 11, 29))).toBe('2026-W01');
  });
});

describe('shiftWeek', () => {
  it('moves across year boundaries', () => {
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeek('2026-W01', -1)).toBe('2025-W52');
  });
});

it('describes the Monday-to-Sunday range', () => {
  expect(weekRange('2026-W44')).toBe('26 Oct – 1 Nov');
});
