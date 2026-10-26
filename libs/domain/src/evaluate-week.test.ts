import { describe, expect, it } from 'vitest';
import { evaluateWeek, type EvaluationIngredient, type EvaluationRecipe } from './evaluate-week.js';

const onion: EvaluationIngredient = {
  id: 'onion',
  name: 'Onion',
  canonicalUnit: 'piece',
  packSizes: [],
};
const cream: EvaluationIngredient = {
  id: 'cream',
  name: 'Cream',
  canonicalUnit: 'ml',
  packSizes: [200, 500],
};
const coriander: EvaluationIngredient = {
  id: 'coriander',
  name: 'Coriander',
  canonicalUnit: 'g',
  packSizes: [],
};
const ingredients = new Map([onion, cream, coriander].map((i) => [i.id, i]));

function recipe(
  id: string,
  servings: number,
  lines: [string, number][],
  tags: string[] = [],
): EvaluationRecipe {
  return {
    id,
    servings,
    tags,
    lines: lines.map(([ingredientId, canonicalAmount]) => ({ ingredientId, canonicalAmount })),
  };
}

function recipes(...list: EvaluationRecipe[]) {
  return new Map(list.map((r) => [r.id, r]));
}

describe('evaluateWeek', () => {
  it('sums each ingredient across entries scaled to the planned servings', () => {
    const soup = recipe('soup', 2, [['onion', 1]]);
    const stew = recipe('stew', 2, [['onion', 2]]);

    const evaluation = evaluateWeek(
      [
        { recipeId: 'soup', servings: 4 },
        { recipeId: 'stew', servings: 2 },
      ],
      recipes(soup, stew),
      ingredients,
    );

    expect(evaluation.lines).toEqual([
      {
        ingredientId: 'onion',
        name: 'Onion',
        unit: 'piece',
        total: 4,
        entryCount: 2,
        leftover: null,
      },
    ]);
  });

  it('doubles every amount when a recipe for 2 is planned for 4', () => {
    const curry = recipe('curry', 2, [
      ['onion', 1],
      ['coriander', 7.5],
    ]);

    const evaluation = evaluateWeek(
      [{ recipeId: 'curry', servings: 4 }],
      recipes(curry),
      ingredients,
    );

    expect(evaluation.lines.map((line) => [line.ingredientId, line.total])).toEqual([
      ['coriander', 15],
      ['onion', 2],
    ]);
  });

  it('Covers AE2. estimates the least-waste leftover from pack sizes', () => {
    const pasta = recipe('pasta', 2, [['cream', 150]]);
    const gratin = recipe('gratin', 4, [['cream', 200]]);

    const evaluation = evaluateWeek(
      [
        { recipeId: 'pasta', servings: 2 },
        { recipeId: 'gratin', servings: 4 },
      ],
      recipes(pasta, gratin),
      ingredients,
    );

    expect(evaluation.lines).toEqual([
      expect.objectContaining({ ingredientId: 'cream', total: 350, leftover: 50 }),
    ]);
  });

  it('Covers AE3. shows no leftover estimate for an ingredient without pack sizes', () => {
    const salsa = recipe('salsa', 1, [['coriander', 10]]);
    const tacos = recipe('tacos', 2, [['coriander', 5]]);

    const evaluation = evaluateWeek(
      [
        { recipeId: 'salsa', servings: 1 },
        { recipeId: 'tacos', servings: 2 },
      ],
      recipes(salsa, tacos),
      ingredients,
    );

    expect(evaluation.lines).toEqual([
      expect.objectContaining({ ingredientId: 'coriander', total: 15, leftover: null }),
    ]);
  });

  it('lists only ingredients used by two or more entries as overlap', () => {
    const soup = recipe('soup', 2, [
      ['onion', 1],
      ['cream', 100],
    ]);
    const stew = recipe('stew', 2, [
      ['onion', 2],
      ['coriander', 5],
    ]);

    const evaluation = evaluateWeek(
      [
        { recipeId: 'soup', servings: 2 },
        { recipeId: 'stew', servings: 2 },
      ],
      recipes(soup, stew),
      ingredients,
    );

    expect(evaluation.overlap.map((line) => line.ingredientId)).toEqual(['onion']);
  });

  it('counts an ingredient once per entry even when a recipe lists it twice', () => {
    const soup = recipe('soup', 2, [
      ['onion', 1],
      ['onion', 1],
    ]);

    const evaluation = evaluateWeek(
      [{ recipeId: 'soup', servings: 2 }],
      recipes(soup),
      ingredients,
    );

    expect(evaluation.lines).toEqual([
      expect.objectContaining({ ingredientId: 'onion', total: 2, entryCount: 1 }),
    ]);
    expect(evaluation.overlap).toEqual([]);
  });

  it('counts each tag once per planned entry', () => {
    const soup = recipe('soup', 2, [], ['vegetarian', 'soup']);
    const stew = recipe('stew', 2, [], ['beef']);

    const evaluation = evaluateWeek(
      [
        { recipeId: 'soup', servings: 4 },
        { recipeId: 'soup', servings: 2 },
        { recipeId: 'stew', servings: 2 },
      ],
      recipes(soup, stew),
      ingredients,
    );

    expect(evaluation.tagCounts).toEqual({ beef: 1, soup: 2, vegetarian: 2 });
  });

  it('evaluates an empty week to nothing', () => {
    expect(evaluateWeek([], new Map(), ingredients)).toEqual({
      lines: [],
      overlap: [],
      tagCounts: {},
    });
  });
});
