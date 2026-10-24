import { lookupUnit, unitKey } from './units.js';

describe('lookupUnit', () => {
  it.each(['g', 'G', ' grams ', 'gram'])('resolves %j to g', (spelling) => {
    expect(lookupUnit(spelling)?.code).toBe('g');
  });

  it('resolves full names of spoons', () => {
    expect(lookupUnit('teaspoon')?.code).toBe('tsp');
    expect(lookupUnit('Tablespoons')?.code).toBe('tbsp');
  });

  it.each(['cup', 'oz', 'fl oz', 'lb', 'handful'])('does not know %j', (unit) => {
    expect(lookupUnit(unit)).toBeUndefined();
  });

  it('keeps count-like units in separate dimensions', () => {
    expect(lookupUnit('clove')?.dimension).not.toBe(lookupUnit('piece')?.dimension);
  });

  it('puts metric units of one kind in one dimension', () => {
    expect(lookupUnit('kg')?.dimension).toBe(lookupUnit('mg')?.dimension);
    expect(lookupUnit('tbsp')?.dimension).toBe(lookupUnit('l')?.dimension);
  });
});

describe('unitKey', () => {
  it('maps a known spelling to its registry code', () => {
    expect(unitKey('Grams')).toBe('g');
    expect(unitKey('cloves')).toBe('clove');
  });

  it('trims and lowercases an unknown unit', () => {
    expect(unitKey('  Handful ')).toBe('handful');
  });
});
