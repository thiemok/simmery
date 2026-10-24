export type Dimension = 'mass' | 'volume' | `count:${string}`;

export interface UnitDefinition {
  code: string;
  dimension: Dimension;
  /** Size of one unit in its dimension's base unit (g, ml, or the count unit itself). */
  toBase: number;
}

interface RegistryEntry extends UnitDefinition {
  spellings: readonly string[];
}

function countUnit(code: string, spellings: readonly string[]): RegistryEntry {
  return { code, dimension: `count:${code}`, toBase: 1, spellings };
}

// Ambiguous units (cup, oz, fl oz, lb) are deliberately absent; users add them as
// per-ingredient conversions instead.
const registry: readonly RegistryEntry[] = [
  { code: 'mg', dimension: 'mass', toBase: 0.001, spellings: ['milligram', 'milligrams'] },
  { code: 'g', dimension: 'mass', toBase: 1, spellings: ['gram', 'grams'] },
  { code: 'kg', dimension: 'mass', toBase: 1000, spellings: ['kilogram', 'kilograms'] },
  {
    code: 'ml',
    dimension: 'volume',
    toBase: 1,
    spellings: ['milliliter', 'milliliters', 'millilitre', 'millilitres'],
  },
  {
    code: 'cl',
    dimension: 'volume',
    toBase: 10,
    spellings: ['centiliter', 'centiliters', 'centilitre', 'centilitres'],
  },
  {
    code: 'dl',
    dimension: 'volume',
    toBase: 100,
    spellings: ['deciliter', 'deciliters', 'decilitre', 'decilitres'],
  },
  {
    code: 'l',
    dimension: 'volume',
    toBase: 1000,
    spellings: ['liter', 'liters', 'litre', 'litres'],
  },
  { code: 'tsp', dimension: 'volume', toBase: 5, spellings: ['teaspoon', 'teaspoons'] },
  { code: 'tbsp', dimension: 'volume', toBase: 15, spellings: ['tablespoon', 'tablespoons'] },
  countUnit('piece', ['pieces', 'pc', 'pcs']),
  countUnit('clove', ['cloves']),
  countUnit('pinch', ['pinches']),
  countUnit('bunch', ['bunches']),
  countUnit('slice', ['slices']),
  countUnit('sprig', ['sprigs']),
  countUnit('can', ['cans']),
];

const bySpelling = new Map<string, UnitDefinition>(
  registry.flatMap(({ spellings, ...unit }) =>
    [unit.code, ...spellings].map((spelling) => [spelling, unit] as const),
  ),
);

function clean(unit: string): string {
  return unit.trim().toLowerCase();
}

export function lookupUnit(unit: string): UnitDefinition | undefined {
  return bySpelling.get(clean(unit));
}

/** The form a unit is stored and compared in: its registry code when known, otherwise trimmed and lowercased. */
export function unitKey(unit: string): string {
  const cleaned = clean(unit);
  return bySpelling.get(cleaned)?.code ?? cleaned;
}
