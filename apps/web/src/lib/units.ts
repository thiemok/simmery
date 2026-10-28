import { normalize, type IngredientUnits } from '@simmery/units';

/**
 * Whether a line's unit cannot be normalized into its ingredient's canonical unit,
 * with the same function the domain saves with (R6, KTD6). Lines that are not
 * complete yet are not flagged.
 */
export function isUnresolved(
  amount: number | null,
  unit: string,
  ingredient: IngredientUnits | null,
): boolean {
  if (!ingredient || amount === null || amount < 0 || unit.trim() === '') {
    return false;
  }
  return !normalize(amount, unit.trim(), ingredient).resolved;
}
