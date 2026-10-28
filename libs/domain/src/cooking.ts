import { cookEvents, planEntries, weekPlans, type Database } from '@simmery/db';
import { roundAmount } from '@simmery/units';
import { and, asc, eq } from 'drizzle-orm';
import { NotFoundError, isUuid, throwIfIssues, type FieldIssue } from './errors.js';
import { getRecipe, type Recipe } from './recipes.js';

export interface CookEvent {
  id: string;
  cookedAt: Date;
  rating: number | null;
}

export interface CookView {
  entry: { id: string; weekKey: string; servings: number; day: number | null };
  /** The recipe scaled to the entry's servings. */
  recipe: Recipe;
  cookEvents: CookEvent[];
}

const cookEventColumns = {
  id: cookEvents.id,
  cookedAt: cookEvents.cookedAt,
  rating: cookEvents.rating,
};

/** Scales every line of the recipe from its own servings to `servings` (R18). */
export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  if (!Number.isInteger(servings) || servings < 1) {
    throwIfIssues([{ field: 'servings', message: 'must be a positive whole number' }]);
  }
  const scale = servings / recipe.servings;
  return {
    ...recipe,
    servings,
    lines: recipe.lines.map((line) => ({
      ...line,
      amount: roundAmount(line.amount * scale),
      canonicalAmount: roundAmount(line.canonicalAmount * scale),
    })),
  };
}

async function loadEntry(db: Database, userId: string, planEntryId: string) {
  if (!isUuid(planEntryId)) {
    throw new NotFoundError('plan_entry', planEntryId);
  }
  const [entry] = await db
    .select({
      id: planEntries.id,
      weekKey: weekPlans.weekKey,
      recipeId: planEntries.recipeId,
      servings: planEntries.servings,
      day: planEntries.day,
    })
    .from(planEntries)
    .innerJoin(
      weekPlans,
      and(eq(weekPlans.userId, planEntries.userId), eq(weekPlans.id, planEntries.weekPlanId)),
    )
    .where(and(eq(planEntries.userId, userId), eq(planEntries.id, planEntryId)));
  if (!entry) {
    throw new NotFoundError('plan_entry', planEntryId);
  }
  return entry;
}

/** The entry's recipe scaled to its servings, with the entry's cook events oldest first. */
export async function getCookView(
  db: Database,
  userId: string,
  planEntryId: string,
): Promise<CookView> {
  const { recipeId, ...entry } = await loadEntry(db, userId, planEntryId);
  const [recipe, events] = await Promise.all([
    getRecipe(db, userId, recipeId),
    db
      .select(cookEventColumns)
      .from(cookEvents)
      .where(and(eq(cookEvents.userId, userId), eq(cookEvents.planEntryId, planEntryId)))
      .orderBy(asc(cookEvents.cookedAt), asc(cookEvents.id)),
  ]);
  return { entry, recipe: scaleRecipe(recipe, entry.servings), cookEvents: events };
}

function ratingIssues(rating: number | null | undefined): FieldIssue[] {
  return rating == null || (Number.isInteger(rating) && rating >= 1 && rating <= 5)
    ? []
    : [{ field: 'rating', message: 'must be a whole number from 1 to 5' }];
}

/** Records that the entry was cooked at `now`; cooking an entry again adds another event (R19). */
export async function markCooked(
  db: Database,
  userId: string,
  planEntryId: string,
  { rating = null }: { rating?: number | null } = {},
  now: Date = new Date(),
): Promise<CookEvent> {
  throwIfIssues(ratingIssues(rating));
  await loadEntry(db, userId, planEntryId);
  const [event] = await db
    .insert(cookEvents)
    .values({ userId, planEntryId, cookedAt: now, rating })
    .returning(cookEventColumns);
  return event;
}

export async function rateCookEvent(
  db: Database,
  userId: string,
  cookEventId: string,
  rating: number | null,
): Promise<CookEvent> {
  throwIfIssues(ratingIssues(rating));
  if (!isUuid(cookEventId)) {
    throw new NotFoundError('cook_event', cookEventId);
  }
  const [event] = await db
    .update(cookEvents)
    .set({ rating })
    .where(and(eq(cookEvents.userId, userId), eq(cookEvents.id, cookEventId)))
    .returning(cookEventColumns);
  if (!event) {
    throw new NotFoundError('cook_event', cookEventId);
  }
  return event;
}

/** Undoes a mistaken mark, so the entry can be removed from its week again. */
export async function deleteCookEvent(
  db: Database,
  userId: string,
  cookEventId: string,
): Promise<void> {
  if (!isUuid(cookEventId)) {
    throw new NotFoundError('cook_event', cookEventId);
  }
  const [deleted] = await db
    .delete(cookEvents)
    .where(and(eq(cookEvents.userId, userId), eq(cookEvents.id, cookEventId)))
    .returning({ id: cookEvents.id });
  if (!deleted) {
    throw new NotFoundError('cook_event', cookEventId);
  }
}
