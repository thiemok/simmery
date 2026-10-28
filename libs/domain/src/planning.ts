import {
  cookEvents,
  planEntries,
  recipes,
  weekPlans,
  weekSnapshots,
  type Database,
} from '@simmery/db';
import { and, asc, eq, exists, inArray, notExists, sql } from 'drizzle-orm';
import { ConflictError, NotFoundError, isUuid, throwIfIssues, type FieldIssue } from './errors.js';
import {
  evaluateEntries,
  loadOwnedRecipes,
  servingsIssues,
  type WeekEvaluation,
} from './evaluate-week.js';

export interface WeekEntryInput {
  /** A saved entry to update in place; omitted for a new entry. */
  id?: string;
  recipeId: string;
  servings: number;
  /** ISO weekday, 1 (Monday) to 7. */
  day?: number | null;
}

export interface WeekEntry {
  id: string;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  day: number | null;
}

export interface Week {
  id: string;
  weekKey: string;
  entries: WeekEntry[];
  evaluation: WeekEvaluation;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const weekKeyPattern = /^(\d{4})-W(\d{2})$/;

function firstMonday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  return jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
}

/** Start of an ISO week (`YYYY-Www`) at Monday 00:00 UTC, or null for a week that does not exist. */
export function weekStart(weekKey: string): Date | null {
  const match = weekKeyPattern.exec(weekKey);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  const weeksInYear = (firstMonday(year + 1) - firstMonday(year)) / WEEK_MS;
  if (week < 1 || week > weeksInYear) {
    return null;
  }
  return new Date(firstMonday(year) + (week - 1) * WEEK_MS);
}

function hasEnded(weekKey: string, now: Date): boolean {
  const start = weekStart(weekKey);
  return start !== null && start.getTime() + WEEK_MS <= now.getTime();
}

export function checkWeekKey(weekKey: string): void {
  if (!weekStart(weekKey)) {
    throwIfIssues([{ field: 'weekKey', message: 'must be an existing ISO week like 2026-W44' }]);
  }
}

export async function ensureWeek(db: Database, userId: string, weekKey: string) {
  const find = () =>
    db
      .select({ id: weekPlans.id, weekKey: weekPlans.weekKey })
      .from(weekPlans)
      .where(and(eq(weekPlans.userId, userId), eq(weekPlans.weekKey, weekKey)));
  const [existing] = await find();
  if (existing) {
    return existing;
  }
  await db.insert(weekPlans).values({ userId, weekKey }).onConflictDoNothing();
  const [created] = await find();
  return created;
}

async function loadEntries(db: Database, userId: string, weekPlanId: string): Promise<WeekEntry[]> {
  return db
    .select({
      id: planEntries.id,
      recipeId: planEntries.recipeId,
      recipeTitle: recipes.title,
      servings: planEntries.servings,
      day: planEntries.day,
    })
    .from(planEntries)
    .innerJoin(
      recipes,
      and(eq(recipes.userId, planEntries.userId), eq(recipes.id, planEntries.recipeId)),
    )
    .where(and(eq(planEntries.userId, userId), eq(planEntries.weekPlanId, weekPlanId)))
    .orderBy(
      sql`${planEntries.day} asc nulls last`,
      asc(sql`lower(${recipes.title})`),
      asc(planEntries.id),
    );
}

export async function evaluateSavedWeek(
  db: Database,
  userId: string,
  weekPlanId: string,
): Promise<WeekEvaluation> {
  return evaluateEntries(db, userId, await loadEntries(db, userId, weekPlanId));
}

/** Stores the week's evaluation unless a snapshot exists; snapshots are never overwritten (KTD13). */
export async function writeSnapshot(
  db: Database,
  userId: string,
  weekPlanId: string,
  evaluation: WeekEvaluation,
): Promise<void> {
  await db
    .insert(weekSnapshots)
    .values({ userId, weekPlanId, evaluation })
    .onConflictDoNothing({ target: weekSnapshots.weekPlanId });
}

/** Snapshots every ended week of the caller that has entries and no snapshot yet (KTD13). */
export async function snapshotEndedWeeks(db: Database, userId: string, now: Date): Promise<void> {
  const candidates = await db
    .select({ id: weekPlans.id, weekKey: weekPlans.weekKey })
    .from(weekPlans)
    .where(
      and(
        eq(weekPlans.userId, userId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(weekSnapshots)
            .where(eq(weekSnapshots.weekPlanId, weekPlans.id)),
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(planEntries)
            .where(and(eq(planEntries.userId, userId), eq(planEntries.weekPlanId, weekPlans.id))),
        ),
      ),
    );
  for (const week of candidates.filter((candidate) => hasEnded(candidate.weekKey, now))) {
    await writeSnapshot(db, userId, week.id, await evaluateSavedWeek(db, userId, week.id));
  }
}

/** Gets or creates the caller's week, with its entries and their evaluation. */
export async function getWeek(
  db: Database,
  userId: string,
  weekKey: string,
  now: Date = new Date(),
): Promise<Week> {
  checkWeekKey(weekKey);
  await snapshotEndedWeeks(db, userId, now);
  const week = await ensureWeek(db, userId, weekKey);
  const entries = await loadEntries(db, userId, week.id);
  return { ...week, entries, evaluation: await evaluateEntries(db, userId, entries) };
}

function entryIssues(entries: readonly WeekEntryInput[]): FieldIssue[] {
  const issues = servingsIssues(entries);
  entries.forEach((entry, index) => {
    const { day } = entry;
    if (day != null && !(Number.isInteger(day) && day >= 1 && day <= 7)) {
      issues.push({ field: `entries[${index}].day`, message: 'must be a weekday from 1 to 7' });
    }
  });
  const ids = entries.flatMap((entry) => (entry.id ? [entry.id] : []));
  if (new Set(ids).size !== ids.length) {
    issues.push({ field: 'entries', message: 'must not list an entry twice' });
  }
  return issues;
}

/**
 * Replaces the week's entries: given IDs are updated in place, others inserted, and
 * omitted entries deleted. Removing an entry with cook history is refused (R20).
 */
export async function setWeekEntries(
  db: Database,
  userId: string,
  weekKey: string,
  entries: readonly WeekEntryInput[],
  now: Date = new Date(),
): Promise<Week> {
  checkWeekKey(weekKey);
  throwIfIssues(entryIssues(entries));
  const unknownId = entries.find((entry) => entry.id !== undefined && !isUuid(entry.id))?.id;
  if (unknownId) {
    throw new NotFoundError('plan_entry', unknownId);
  }

  const week = await ensureWeek(db, userId, weekKey);
  await db.transaction(async (tx) => {
    const saved = await tx
      .select({ id: planEntries.id, recipeId: planEntries.recipeId })
      .from(planEntries)
      .where(and(eq(planEntries.userId, userId), eq(planEntries.weekPlanId, week.id)));
    const savedById = new Map(saved.map((entry) => [entry.id, entry]));

    const issues: FieldIssue[] = [];
    entries.forEach((entry, index) => {
      const current = entry.id ? savedById.get(entry.id) : undefined;
      if (entry.id && !current) {
        throw new NotFoundError('plan_entry', entry.id);
      }
      if (current && current.recipeId !== entry.recipeId) {
        issues.push({
          field: `entries[${index}].recipeId`,
          message: 'cannot change the recipe of a saved entry',
        });
      }
    });
    throwIfIssues(issues);

    const added = entries.filter((entry) => !entry.id);
    await checkNewRecipes(tx, userId, entries);

    const keptIds = new Set(entries.flatMap((entry) => (entry.id ? [entry.id] : [])));
    const removedIds = saved.filter((entry) => !keptIds.has(entry.id)).map((entry) => entry.id);
    if (removedIds.length > 0) {
      const [cooked] = await tx
        .select({ id: cookEvents.planEntryId })
        .from(cookEvents)
        .where(and(eq(cookEvents.userId, userId), inArray(cookEvents.planEntryId, removedIds)))
        .limit(1);
      if (cooked) {
        throw new ConflictError('entry_cooked', `entry ${cooked.id} has been cooked`);
      }
      await tx
        .delete(planEntries)
        .where(and(eq(planEntries.userId, userId), inArray(planEntries.id, removedIds)));
    }

    for (const entry of entries) {
      if (entry.id) {
        await tx
          .update(planEntries)
          .set({ servings: entry.servings, day: entry.day ?? null })
          .where(and(eq(planEntries.userId, userId), eq(planEntries.id, entry.id)));
      }
    }
    if (added.length > 0) {
      await tx.insert(planEntries).values(
        added.map((entry) => ({
          userId,
          weekPlanId: week.id,
          recipeId: entry.recipeId,
          servings: entry.servings,
          day: entry.day ?? null,
        })),
      );
    }
  });
  return getWeek(db, userId, weekKey, now);
}

async function checkNewRecipes(
  db: Database,
  userId: string,
  entries: readonly WeekEntryInput[],
): Promise<void> {
  const rows = await loadOwnedRecipes(
    db,
    userId,
    entries.filter((entry) => !entry.id).map((entry) => entry.recipeId),
  );
  const archived = new Set(rows.filter((row) => row.archivedAt).map((row) => row.id));
  throwIfIssues(
    entries.flatMap((entry, index) =>
      !entry.id && archived.has(entry.recipeId)
        ? [{ field: `entries[${index}].recipeId`, message: 'recipe is archived' }]
        : [],
    ),
  );
}
