import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from './client.js';
import { migrationsFolder } from './migrate.js';
import {
  cookEvents,
  ingredients,
  planEntries,
  recipeLines,
  recipeSteps,
  recipeTags,
  recipes,
  shareLinks,
  tasteProfiles,
  users,
  weekPlans,
} from './schema/index.js';
import { createTestDatabase, type TestDatabase } from './testing.js';

/** Resolves to the Postgres constraint a rejected query violated. */
async function violatedConstraint(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint;
  }
  throw new Error('expected the query to be rejected');
}

let testDb: TestDatabase;
let db: Database;

beforeEach(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
  await db.insert(users).values([
    { id: 'user_a', email: 'a@example.com' },
    { id: 'user_b', email: 'b@example.com' },
  ]);
});

afterEach(async () => {
  await testDb.close();
});

async function addIngredient(userId: string, name: string) {
  const [row] = await db
    .insert(ingredients)
    .values({ userId, name, canonicalUnit: 'g' })
    .returning();
  return row;
}

async function addRecipe(userId: string) {
  const [row] = await db.insert(recipes).values({ userId, title: 'Dal', servings: 2 }).returning();
  return row;
}

async function addPlanEntry(userId: string, recipeId: string) {
  const [week] = await db.insert(weekPlans).values({ userId, weekKey: '2026-W44' }).returning();
  const [entry] = await db
    .insert(planEntries)
    .values({ userId, weekPlanId: week.id, recipeId, servings: 2 })
    .returning();
  return entry;
}

describe('migrations', () => {
  it('apply to an empty database and are a no-op when run again', async () => {
    const client = new PGlite();
    try {
      await migrate(drizzle(client), { migrationsFolder });
      await migrate(drizzle(client), { migrationsFolder });
      const { rows } = await client.query<{ count: number }>(
        `select count(*)::int as count from information_schema.tables where table_schema = 'public'`,
      );
      expect(rows[0].count).toBe(17);
    } finally {
      await client.close();
    }
  });
});

describe('uniqueness', () => {
  it('rejects a second ingredient with the same name for one user, ignoring case', async () => {
    await addIngredient('user_a', 'Garlic');
    expect(
      await violatedConstraint(
        db.insert(ingredients).values({ userId: 'user_a', name: 'garlic', canonicalUnit: 'clove' }),
      ),
    ).toBe('ingredients_user_id_name_key');
  });

  it('allows the same ingredient name for two users', async () => {
    await addIngredient('user_a', 'Garlic');
    await addIngredient('user_b', 'Garlic');
    expect(await db.select().from(ingredients)).toHaveLength(2);
  });

  it('rejects a second week plan for the same user and week', async () => {
    await db.insert(weekPlans).values({ userId: 'user_a', weekKey: '2026-W44' });
    expect(
      await violatedConstraint(
        db.insert(weekPlans).values({ userId: 'user_a', weekKey: '2026-W44' }),
      ),
    ).toBe('week_plans_user_id_week_key_key');
  });

  it('rejects a second taste profile for one user', async () => {
    await db.insert(tasteProfiles).values({ userId: 'user_a', body: 'likes lentils' });
    expect(
      await violatedConstraint(db.insert(tasteProfiles).values({ userId: 'user_a', body: '' })),
    ).toBe('taste_profiles_pkey');
  });

  it('rejects a share token reused by another user', async () => {
    const recipeA = await addRecipe('user_a');
    const recipeB = await addRecipe('user_b');
    await db.insert(shareLinks).values({ userId: 'user_a', recipeId: recipeA.id, token: 'tok' });
    expect(
      await violatedConstraint(
        db.insert(shareLinks).values({ userId: 'user_b', recipeId: recipeB.id, token: 'tok' }),
      ),
    ).toBe('share_links_token_key');
  });
});

describe('ownership', () => {
  it("rejects a recipe line pointing at another user's ingredient", async () => {
    const recipe = await addRecipe('user_a');
    const foreignIngredient = await addIngredient('user_b', 'Garlic');
    expect(
      await violatedConstraint(
        db.insert(recipeLines).values({
          userId: 'user_a',
          recipeId: recipe.id,
          position: 0,
          ingredientId: foreignIngredient.id,
          amount: 2,
          unit: 'g',
          canonicalAmount: 2,
        }),
      ),
    ).toBe('recipe_lines_ingredient_fk');
  });

  it("rejects a plan entry pointing at another user's recipe", async () => {
    const foreignRecipe = await addRecipe('user_b');
    const [week] = await db
      .insert(weekPlans)
      .values({ userId: 'user_a', weekKey: '2026-W44' })
      .returning();
    expect(
      await violatedConstraint(
        db.insert(planEntries).values({
          userId: 'user_a',
          weekPlanId: week.id,
          recipeId: foreignRecipe.id,
          servings: 2,
        }),
      ),
    ).toBe('plan_entries_recipe_fk');
  });
});

describe('delete behavior', () => {
  it('removes lines, steps, tags and share links with their recipe', async () => {
    const recipe = await addRecipe('user_a');
    const ingredient = await addIngredient('user_a', 'Lentils');
    await db.insert(recipeLines).values({
      userId: 'user_a',
      recipeId: recipe.id,
      position: 0,
      ingredientId: ingredient.id,
      amount: 200,
      unit: 'g',
      canonicalAmount: 200,
    });
    await db
      .insert(recipeSteps)
      .values({ userId: 'user_a', recipeId: recipe.id, position: 0, text: 'Simmer' });
    await db
      .insert(recipeTags)
      .values({ userId: 'user_a', recipeId: recipe.id, tag: 'vegetarian' });
    await db.insert(shareLinks).values({ userId: 'user_a', recipeId: recipe.id, token: 'tok' });

    await db.delete(recipes).where(eq(recipes.id, recipe.id));

    expect(await db.select().from(recipeLines)).toEqual([]);
    expect(await db.select().from(recipeSteps)).toEqual([]);
    expect(await db.select().from(recipeTags)).toEqual([]);
    expect(await db.select().from(shareLinks)).toEqual([]);
    expect(await db.select().from(ingredients)).toHaveLength(1);
  });

  it('refuses deleting a planned recipe, which is archived instead and keeps resolving', async () => {
    const recipe = await addRecipe('user_a');
    const entry = await addPlanEntry('user_a', recipe.id);
    await db.insert(cookEvents).values({ userId: 'user_a', planEntryId: entry.id, rating: 4 });

    expect(await violatedConstraint(db.delete(recipes).where(eq(recipes.id, recipe.id)))).toBe(
      'plan_entries_recipe_fk',
    );

    await db.update(recipes).set({ archivedAt: new Date() }).where(eq(recipes.id, recipe.id));
    const history = await db
      .select({ title: recipes.title, rating: cookEvents.rating })
      .from(cookEvents)
      .innerJoin(planEntries, eq(planEntries.id, cookEvents.planEntryId))
      .innerJoin(recipes, eq(recipes.id, planEntries.recipeId));
    expect(history).toEqual([{ title: 'Dal', rating: 4 }]);
  });

  it('refuses deleting a plan entry that has a cook event', async () => {
    const recipe = await addRecipe('user_a');
    const entry = await addPlanEntry('user_a', recipe.id);
    await db.insert(cookEvents).values({ userId: 'user_a', planEntryId: entry.id });

    expect(
      await violatedConstraint(db.delete(planEntries).where(eq(planEntries.id, entry.id))),
    ).toBe('cook_events_plan_entry_fk');
  });

  it('removes all rows of a deleted user and leaves other users untouched', async () => {
    const recipe = await addRecipe('user_a');
    const ingredient = await addIngredient('user_a', 'Lentils');
    await db.insert(recipeLines).values({
      userId: 'user_a',
      recipeId: recipe.id,
      position: 0,
      ingredientId: ingredient.id,
      amount: 200,
      unit: 'g',
      canonicalAmount: 200,
    });
    const entry = await addPlanEntry('user_a', recipe.id);
    await db.insert(cookEvents).values({ userId: 'user_a', planEntryId: entry.id });
    await db.insert(tasteProfiles).values({ userId: 'user_a', body: 'likes lentils' });
    await addRecipe('user_b');

    await db.delete(users).where(eq(users.id, 'user_a'));

    const remaining = await Promise.all(
      [recipes, ingredients, recipeLines, weekPlans, planEntries, cookEvents, tasteProfiles].map(
        (table) => db.$count(table, eq(table.userId, 'user_a')),
      ),
    );
    expect(remaining).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(await db.$count(recipes, eq(recipes.userId, 'user_b'))).toBe(1);
  });
});
