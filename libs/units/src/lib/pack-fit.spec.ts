import { packFit } from './pack-fit.js';

describe('packFit', () => {
  it('Covers AE2. picks the least-waste combination', () => {
    expect(packFit(350, [200, 500])).toEqual({
      packs: [{ size: 200, count: 2 }],
      purchased: 400,
      leftover: 50,
    });
  });

  it('fits an exact multiple with no leftover', () => {
    expect(packFit(400, [200, 500])).toEqual({
      packs: [{ size: 200, count: 2 }],
      purchased: 400,
      leftover: 0,
    });
  });

  it('breaks an excess tie with fewer packs', () => {
    expect(packFit(400, [200, 400])).toEqual({
      packs: [{ size: 400, count: 1 }],
      purchased: 400,
      leftover: 0,
    });
  });

  it('mixes pack sizes when that wastes least', () => {
    expect(packFit(650.000001, [200, 500])).toEqual({
      packs: [
        { size: 500, count: 1 },
        { size: 200, count: 1 },
      ],
      purchased: 700,
      leftover: 49.999999,
    });
  });

  it('handles fractional totals from scaled recipes', () => {
    expect(packFit(66.666667, [200, 500])).toEqual({
      packs: [{ size: 200, count: 1 }],
      purchased: 200,
      leftover: 133.333333,
    });
  });

  it('handles fractional pack sizes', () => {
    expect(packFit(1.5, [0.5, 1])).toEqual({
      packs: [
        { size: 1, count: 1 },
        { size: 0.5, count: 1 },
      ],
      purchased: 1.5,
      leftover: 0,
    });
  });

  it('buys nothing when nothing is needed', () => {
    expect(packFit(0, [200, 500])).toEqual({ packs: [], purchased: 0, leftover: 0 });
  });

  it('Covers AE3. gives no estimate without pack sizes', () => {
    expect(packFit(350, [])).toBeNull();
  });

  it('stays fast for absurd amounts', () => {
    const fit = packFit(1e12, [7, 13]);

    expect(fit).not.toBeNull();
    expect(fit?.purchased).toBeGreaterThanOrEqual(1e12);
    expect(fit?.leftover).toBeGreaterThanOrEqual(0);
    expect(fit?.leftover).toBeLessThan(13);
  });

  it.each([
    [-1, [200]],
    [Number.NaN, [200]],
    [100, [0]],
    [100, [-200]],
  ])('throws for needed %d with packs %j', (needed, packs) => {
    expect(() => packFit(needed, packs)).toThrow(RangeError);
  });
});
