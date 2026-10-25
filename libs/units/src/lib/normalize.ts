import { lookupUnit, unitKey } from './units.js';

export interface UnitConversion {
  unit: string;
  /** How many canonical units one `unit` equals: "1 clove ≈ 5 g" on a clove ingredient is `{ unit: 'g', factor: 0.2 }`. */
  factor: number;
}

export interface IngredientUnits {
  canonicalUnit: string;
  conversions: readonly UnitConversion[];
}

export type NormalizeResult =
  | { resolved: true; amount: number }
  | { resolved: false; unit: string };

export function roundAmount(amount: number): number {
  return Math.round(amount * 1e6) / 1e6;
}

export function normalize(
  amount: number,
  unit: string,
  ingredient: IngredientUnits,
): NormalizeResult {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`Amount must be a finite, non-negative number, got ${amount}`);
  }

  const key = unitKey(unit);
  const canonical = unitKey(ingredient.canonicalUnit);
  if (key === canonical) {
    return { resolved: true, amount: roundAmount(amount) };
  }

  const conversion = ingredient.conversions.find((candidate) => unitKey(candidate.unit) === key);
  if (conversion) {
    return { resolved: true, amount: roundAmount(amount * conversion.factor) };
  }

  const from = lookupUnit(key);
  const to = lookupUnit(canonical);
  if (from && to && from.dimension === to.dimension) {
    return { resolved: true, amount: roundAmount((amount * from.toBase) / to.toBase) };
  }

  return { resolved: false, unit: key };
}
