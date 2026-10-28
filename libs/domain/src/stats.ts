import {
  cookEvents,
  planEntries,
  recipes,
  weekPlans,
  weekSnapshots,
  type Database,
} from '@simmery/db';
import { roundAmount } from '@simmery/units';
import { and, asc, count, eq, exists, inArray, max, sql } from 'drizzle-orm';
import type { WeekEvaluation } from './evaluate-week.js';
import { WEEK_MS, evaluateSavedWeek, snapshotEndedWeeks, startedWithinWeeks } from './planning.js';

export interface RecipeCookStats {
  recipeId: string;
  title: string;
  archived: boolean;
  cookCount: number;
  lastCookedAt: Date | null;
  averageRating: number | null;
}

export interface CookRecord {
  cookEventId: string;
  planEntryId: string;
  recipeId: string;
  recipeTitle: string;
  cookedAt: Date;
  rating: number | null;
}

export interface WeekTrend {
  weekKey: string;
  /** Read from the week's snapshot (KTD13); otherwise evaluated from the current plan. */
  frozen: boolean;
  evaluation: WeekEvaluation;
}

export interface BoughtIngredient {
  ingredientId: string;
  name: string;
  unit: string;
  /** Number of weeks in the window that needed it. */
  weeks: number;
  total: number;
}

export interface Statistics {
  /** Non-archived recipes, plus archived ones that were cooked; most recently cooked first. */
  recipes: RecipeCookStats[];
  /** Non-archived recipes never cooked or last cooked before the stale span; oldest first. */
  notCookedRecently: RecipeCookStats[];
  /** Every cook event, oldest first; the rated ones are the ratings over time. */
  cooks: CookRecord[];
  weeks: WeekTrend[];
  mostBought: BoughtIngredient[];
}

const STALE_AFTER_WEEKS = 4;
const TREND_WEEKS = 12;
const MOST_BOUGHT_LIMIT = 10;

/** Never-cooked recipes sort as the oldest. */
function cookedTime(row: RecipeCookStats): number {
  return row.lastCookedAt?.getTime() ?? -Infinity;
}

async function recipeStats(db: Database, userId: string): Promise<RecipeCookStats[]> {
  const rows = await db
    .select({
      recipeId: recipes.id,
      title: recipes.title,
      archivedAt: recipes.archivedAt,
      cookCount: count(cookEvents.id),
      lastCookedAt: max(cookEvents.cookedAt),
      averageRating: sql<number | null>`avg(${cookEvents.rating})::float8`,
    })
    .from(recipes)
    .leftJoin(
      planEntries,
      and(eq(planEntries.userId, recipes.userId), eq(planEntries.recipeId, recipes.id)),
    )
    .leftJoin(
      cookEvents,
      and(eq(cookEvents.userId, planEntries.userId), eq(cookEvents.planEntryId, planEntries.id)),
    )
    .where(eq(recipes.userId, userId))
    .groupBy(recipes.id);
  return rows
    .filter((row) => row.archivedAt === null || row.cookCount > 0)
    .map(({ archivedAt, averageRating, ...row }) => ({
      ...row,
      archived: archivedAt !== null,
      averageRating: averageRating === null ? null : roundAmount(averageRating),
    }))
    .sort((a, b) => cookedTime(b) - cookedTime(a) || a.title.localeCompare(b.title));
}

function cookRecords(db: Database, userId: string): Promise<CookRecord[]> {
  return db
    .select({
      cookEventId: cookEvents.id,
      planEntryId: cookEvents.planEntryId,
      recipeId: recipes.id,
      recipeTitle: recipes.title,
      cookedAt: cookEvents.cookedAt,
      rating: cookEvents.rating,
    })
    .from(cookEvents)
    .innerJoin(
      planEntries,
      and(eq(planEntries.userId, cookEvents.userId), eq(planEntries.id, cookEvents.planEntryId)),
    )
    .innerJoin(
      recipes,
      and(eq(recipes.userId, planEntries.userId), eq(recipes.id, planEntries.recipeId)),
    )
    .where(eq(cookEvents.userId, userId))
    .orderBy(asc(cookEvents.cookedAt), asc(cookEvents.id));
}

/** Weeks with entries that started within the trend span up to now; snapshots win over live figures. */
async function weekTrends(db: Database, userId: string, now: Date): Promise<WeekTrend[]> {
  const planned = await db
    .select({ id: weekPlans.id, weekKey: weekPlans.weekKey })
    .from(weekPlans)
    .where(
      and(
        eq(weekPlans.userId, userId),
        exists(
          db
            .select({ one: sql`1` })
            .from(planEntries)
            .where(and(eq(planEntries.userId, userId), eq(planEntries.weekPlanId, weekPlans.id))),
        ),
      ),
    )
    .orderBy(asc(weekPlans.weekKey));
  const inWindow = planned.filter((week) => startedWithinWeeks(week.weekKey, now, TREND_WEEKS));
  const snapshots =
    inWindow.length === 0
      ? []
      : await db
          .select({ weekPlanId: weekSnapshots.weekPlanId, evaluation: weekSnapshots.evaluation })
          .from(weekSnapshots)
          .where(
            and(
              eq(weekSnapshots.userId, userId),
              inArray(
                weekSnapshots.weekPlanId,
                inWindow.map((week) => week.id),
              ),
            ),
          );
  const frozen = new Map(
    snapshots.map((snapshot) => [snapshot.weekPlanId, snapshot.evaluation as WeekEvaluation]),
  );
  return Promise.all(
    inWindow.map(async (week): Promise<WeekTrend> => {
      const evaluation = frozen.get(week.id);
      return evaluation
        ? { weekKey: week.weekKey, frozen: true, evaluation }
        : {
            weekKey: week.weekKey,
            frozen: false,
            evaluation: await evaluateSavedWeek(db, userId, week.id),
          };
    }),
  );
}

function mostBought(weeks: readonly WeekTrend[]): BoughtIngredient[] {
  const bought = new Map<string, BoughtIngredient>();
  for (const { evaluation } of weeks) {
    for (const line of evaluation.lines) {
      const key = `${line.ingredientId}|${line.unit}`;
      const current = bought.get(key);
      bought.set(key, {
        ingredientId: line.ingredientId,
        name: line.name,
        unit: line.unit,
        weeks: (current?.weeks ?? 0) + 1,
        total: roundAmount((current?.total ?? 0) + line.total),
      });
    }
  }
  return [...bought.values()]
    .sort((a, b) => b.weeks - a.weeks || b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, MOST_BOUGHT_LIMIT);
}

/**
 * Cook history and ratings are aggregated live; week trends read snapshots, so later
 * edits to recipes or pack sizes do not rewrite past weeks (R20, KTD13).
 */
export async function getStatistics(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<Statistics> {
  await snapshotEndedWeeks(db, userId, now);
  const [recipeRows, cooks, weeks] = await Promise.all([
    recipeStats(db, userId),
    cookRecords(db, userId),
    weekTrends(db, userId, now),
  ]);
  const staleBefore = now.getTime() - STALE_AFTER_WEEKS * WEEK_MS;
  const notCookedRecently = recipeRows
    .filter(
      (row) =>
        !row.archived && (row.lastCookedAt === null || row.lastCookedAt.getTime() < staleBefore),
    )
    .sort((a, b) => cookedTime(a) - cookedTime(b) || a.title.localeCompare(b.title));
  return { recipes: recipeRows, notCookedRecently, cooks, weeks, mostBought: mostBought(weeks) };
}
