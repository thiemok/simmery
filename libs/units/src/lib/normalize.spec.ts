import { type IngredientUnits, normalize } from './normalize.js';

const flour: IngredientUnits = { canonicalUnit: 'g', conversions: [] };
const oil: IngredientUnits = { canonicalUnit: 'ml', conversions: [] };
const milk: IngredientUnits = { canonicalUnit: 'l', conversions: [] };
const garlic: IngredientUnits = { canonicalUnit: 'clove', conversions: [] };
const garlicWithGrams: IngredientUnits = {
  canonicalUnit: 'clove',
  conversions: [{ unit: 'g', factor: 0.2 }],
};

describe('normalize', () => {
  it('keeps an amount already in the canonical unit', () => {
    expect(normalize(500, 'g', flour)).toEqual({ resolved: true, amount: 500 });
  });

  it('converts through the built-in table within one dimension', () => {
    expect(normalize(1, 'kg', flour)).toEqual({ resolved: true, amount: 1000 });
    expect(normalize(2, 'tbsp', oil)).toEqual({ resolved: true, amount: 30 });
    expect(normalize(250, 'ml', milk)).toEqual({ resolved: true, amount: 0.25 });
  });

  it('matches unit spellings case-insensitively', () => {
    expect(normalize(500, ' Grams', flour)).toEqual({ resolved: true, amount: 500 });
  });

  it('Covers AE1. flags grams of garlic until a conversion exists', () => {
    expect(normalize(50, 'g', garlic)).toEqual({ resolved: false, unit: 'g' });
    expect(normalize(50, 'g', garlicWithGrams)).toEqual({ resolved: true, amount: 10 });
  });

  it('does not chain a built-in hop into a conversion unit', () => {
    expect(normalize(1, 'kg', garlicWithGrams)).toEqual({ resolved: false, unit: 'kg' });
  });

  it('does not guess across dimensions', () => {
    expect(normalize(1, 'piece', flour)).toEqual({ resolved: false, unit: 'piece' });
  });

  it('resolves an unknown unit only through an ingredient conversion', () => {
    const spinach: IngredientUnits = { canonicalUnit: 'g', conversions: [] };
    const spinachWithHandful: IngredientUnits = {
      canonicalUnit: 'g',
      conversions: [{ unit: 'handful', factor: 30 }],
    };

    expect(normalize(2, 'Handful', spinachWithHandful)).toEqual({ resolved: true, amount: 60 });
    expect(normalize(2, 'handful', spinach)).toEqual({ resolved: false, unit: 'handful' });
  });

  it('accepts a zero amount', () => {
    expect(normalize(0, 'g', flour)).toEqual({ resolved: true, amount: 0 });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('throws for amount %d', (amount) => {
    expect(() => normalize(amount, 'g', flour)).toThrow(RangeError);
  });
});
