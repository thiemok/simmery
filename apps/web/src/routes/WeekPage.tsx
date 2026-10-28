import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { conflictMessage, conflictReason } from '../api/errors';
import {
  useRecipes,
  useSetWeekEntries,
  useWeek,
  type Week,
  type WeekEntry,
  type WeekEntryInput,
} from '../api/queries';
import { Empty, ErrorState, Loading, Notice } from '../components/states';
import { Stepper } from '../components/Stepper';
import { formatQuantity } from '../lib/format';
import { useDebounced } from '../lib/use-debounced';
import { shiftWeek, weekRange, WEEKDAYS } from '../lib/week';
import pages from './pages.module.css';
import styles from './WeekPage.module.css';

interface LocalEntry {
  key: string;
  id?: string;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  day: number | null;
}

let nextKey = 0;
const localOf = (entry: WeekEntry): LocalEntry => ({ ...entry, key: `entry-${++nextKey}` });

/**
 * Gives entries that were added locally the IDs a finished save created for them,
 * matching by recipe, so the next save updates them instead of inserting them again.
 */
function withSavedIds(entries: LocalEntry[], saved: readonly WeekEntry[]): LocalEntry[] {
  const claimed = new Set(entries.flatMap((entry) => (entry.id ? [entry.id] : [])));
  return entries.map((entry) => {
    if (entry.id) {
      return entry;
    }
    const match = saved.find(
      (candidate) => candidate.recipeId === entry.recipeId && !claimed.has(candidate.id),
    );
    if (!match) {
      return entry;
    }
    claimed.add(match.id);
    return { ...entry, id: match.id };
  });
}

const toInput = ({ id, recipeId, servings, day }: LocalEntry): WeekEntryInput => ({
  ...(id ? { id } : {}),
  recipeId,
  servings,
  day,
});

function AddMeal({
  onAdd,
}: {
  onAdd: (recipe: { id: string; title: string; servings: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim(), 250);
  const recipes = useRecipes({ query: search });

  if (!open) {
    return (
      <button type="button" className={styles.addMeal} onClick={() => setOpen(true)}>
        + Add a meal
      </button>
    );
  }
  return (
    <div className={`card ${pages.section}`}>
      <label className="field">
        <span>Find a recipe</span>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {recipes.isPending ? (
        <Loading />
      ) : recipes.isError ? (
        <ErrorState error={recipes.error} onRetry={() => recipes.refetch()} />
      ) : recipes.data.length === 0 ? (
        <Empty title="No recipes match.">
          <Link to="/recipes/new" className="btn btn-secondary">
            New recipe
          </Link>
        </Empty>
      ) : (
        <ul className={pages.list}>
          {recipes.data.map((recipe) => (
            <li key={recipe.id} className={pages.item}>
              <span className={pages.itemLink}>
                <b>{recipe.title}</b>
                <small className="soft">{recipe.servings} servings</small>
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={`Add ${recipe.title}`}
                onClick={() => {
                  onAdd(recipe);
                  setOpen(false);
                  setQuery('');
                }}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </div>
  );
}

function Evaluation({ evaluation, meals }: { evaluation: Week['evaluation']; meals: number }) {
  const leftovers = evaluation.lines.filter((line) => line.leftover !== null && line.leftover > 0);
  const tags = Object.entries(evaluation.tagCounts).sort(([, a], [, b]) => b - a);
  return (
    <aside className={styles.panel} aria-label="This week's ingredients">
      <div className={styles.summary}>
        <div>
          <b>{meals}</b>
          <small>meals</small>
        </div>
        <div>
          <b>{evaluation.overlap.length}</b>
          <small>shared ingredients</small>
        </div>
        <div>
          <b>{leftovers.length}</b>
          <small>with leftovers</small>
        </div>
      </div>
      <section className={pages.section} aria-labelledby="overlap-heading">
        <h2 id="overlap-heading">Overlap</h2>
        {evaluation.overlap.length === 0 ? (
          <p className="soft">No ingredient is used by more than one meal.</p>
        ) : (
          <ul className={pages.ingredients}>
            {evaluation.overlap.map((line) => (
              <li key={line.ingredientId}>
                <span className="amount">{formatQuantity(line.total, line.unit)}</span>
                <span>
                  {line.name} <span className="soft">· {line.entryCount} meals</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={pages.section} aria-labelledby="leftovers-heading">
        <h2 id="leftovers-heading">Leftovers</h2>
        {leftovers.length === 0 ? (
          <p className="soft">No leftovers expected from pack sizes.</p>
        ) : (
          <ul className={pages.ingredients}>
            {leftovers.map((line) => (
              <li key={line.ingredientId}>
                <span className="amount">≈ {formatQuantity(line.leftover ?? 0, line.unit)}</span>
                <span>
                  {line.name} <span className="soft">left over</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={pages.section} aria-labelledby="totals-heading">
        <h2 id="totals-heading">Everything this week</h2>
        {evaluation.lines.length === 0 ? (
          <p className="soft">Add meals to see what the week needs.</p>
        ) : (
          <ul className={pages.ingredients}>
            {evaluation.lines.map((line) => (
              <li key={line.ingredientId}>
                <span className="amount">{formatQuantity(line.total, line.unit)}</span>
                <span>{line.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {tags.length > 0 && (
        <section className={pages.section} aria-labelledby="variety-heading">
          <h2 id="variety-heading">Variety</h2>
          <ul className="row">
            {tags.map(([tag, count]) => (
              <li key={tag} className="chip">
                {tag} × {count}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function WeekPlan({ weekKey, week }: { weekKey: string; week: Week }) {
  const [entries, setEntries] = useState<LocalEntry[]>(() => week.entries.map(localOf));
  const latest = useRef(entries);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncing, setDebouncing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [synced, setSynced] = useState(week);
  const save = useSetWeekEntries(weekKey);

  // The whole-list save deletes every entry it omits, so while nothing is waiting to be
  // saved the list follows the server, including meals added elsewhere (the agent, a phone).
  if (week !== synced && !save.isPending && !debouncing && failure === null) {
    setSynced(week);
    const keyById = new Map(entries.flatMap((entry) => (entry.id ? [[entry.id, entry.key]] : [])));
    const next = week.entries.map((entry) => {
      const local = localOf(entry);
      return { ...local, key: keyById.get(entry.id) ?? local.key };
    });
    setEntries(next);
  }

  function commit(next: LocalEntry[]) {
    latest.current = next;
    setEntries(next);
  }

  function send() {
    clearTimeout(timer.current);
    timer.current = undefined;
    setDebouncing(false);
    save.mutate(
      (saved) => {
        const next = withSavedIds(latest.current, saved?.entries ?? []);
        commit(next);
        return next.map(toInput);
      },
      {
        onSuccess: (result) => {
          setFailure(null);
          commit(withSavedIds(latest.current, result.entries));
        },
        onError: (error) => {
          const reason = conflictReason(error);
          if (reason === 'entry_cooked') {
            setFailure(conflictMessage(reason));
            commit(restoreRemoved(latest.current, week.entries.map(localOf)));
          } else {
            setFailure('Could not save your changes.');
          }
        },
      },
    );
  }

  function change(next: LocalEntry[], { debounce = false } = {}) {
    commit(next);
    clearTimeout(timer.current);
    if (debounce) {
      timer.current = setTimeout(send, 400);
      setDebouncing(true);
    } else {
      send();
    }
  }

  useEffect(() => {
    latest.current = entries;
  }, [entries]);

  const sendLatest = useRef<() => void>(() => {});
  useEffect(() => {
    sendLatest.current = send;
  });
  useEffect(
    () => () => {
      // Leaving the page must not drop a servings change still waiting for its debounce.
      if (timer.current !== undefined) {
        sendLatest.current();
      }
    },
    [],
  );

  const update = (key: string, patch: Partial<LocalEntry>, options?: { debounce?: boolean }) =>
    change(
      latest.current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
      options,
    );

  return (
    <div className={styles.layout}>
      <section className={pages.section} aria-labelledby="meals-heading">
        <h2 id="meals-heading" className="visually-hidden">
          Meals
        </h2>
        {failure && (
          <Notice>
            {failure}{' '}
            {failure.startsWith('Could not') && (
              <button type="button" className="btn btn-secondary" onClick={send}>
                Retry
              </button>
            )}
          </Notice>
        )}
        {entries.length === 0 ? (
          <Empty title="Nothing planned yet.">
            <p>Add meals from your recipes, or let your agent plan the week.</p>
          </Empty>
        ) : (
          <ul className={styles.meals}>
            {entries.map((entry, index) => (
              <li key={entry.key} className={styles.meal}>
                <span className={styles.number} aria-hidden="true">
                  {index + 1}
                </span>
                <div className={styles.mealBody}>
                  <b>{entry.recipeTitle}</b>
                  <div className={styles.mealControls}>
                    <Stepper
                      label={`servings of ${entry.recipeTitle}`}
                      value={entry.servings}
                      onChange={(servings) => update(entry.key, { servings }, { debounce: true })}
                    />
                    <label className={styles.day}>
                      <span className="visually-hidden">Day for {entry.recipeTitle}</span>
                      <select
                        className="input"
                        value={entry.day ?? ''}
                        onChange={(event) =>
                          update(entry.key, {
                            day: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      >
                        <option value="">Any day</option>
                        {WEEKDAYS.map((name, day) => (
                          <option key={name} value={day + 1}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={pages.actions}>
                    {entry.id && (
                      <Link
                        to="/cook/$entryId"
                        params={{ entryId: entry.id }}
                        className="btn btn-primary"
                      >
                        Cook
                      </Link>
                    )}
                    <button
                      type="button"
                      className="btn btn-quiet"
                      aria-label={`Remove ${entry.recipeTitle}`}
                      onClick={() =>
                        change(latest.current.filter((other) => other.key !== entry.key))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <AddMeal
          onAdd={(recipe) =>
            change([
              ...latest.current,
              {
                key: `entry-${++nextKey}`,
                recipeId: recipe.id,
                recipeTitle: recipe.title,
                servings: recipe.servings,
                day: null,
              },
            ])
          }
        />
        {save.isPending && (
          <p className="soft" role="status">
            Saving…
          </p>
        )}
      </section>
      <Evaluation evaluation={week.evaluation} meals={week.entries.length} />
    </div>
  );
}

/** Puts back saved entries the server refused to remove, keeping every other local edit. */
function restoreRemoved(local: LocalEntry[], saved: LocalEntry[]): LocalEntry[] {
  const present = new Set(local.flatMap((entry) => (entry.id ? [entry.id] : [])));
  return [...local, ...saved.filter((entry) => entry.id && !present.has(entry.id))];
}

export function WeekPage({ weekKey }: { weekKey: string }) {
  const week = useWeek(weekKey);
  return (
    <div className="page">
      <div className={styles.head}>
        <Link
          to="/week/$weekKey"
          params={{ weekKey: shiftWeek(weekKey, -1) }}
          className="icon-btn"
          aria-label="Previous week"
        >
          ‹
        </Link>
        <div>
          <p className="kicker">{weekKey}</p>
          <h1 tabIndex={-1}>{weekRange(weekKey)}</h1>
        </div>
        <Link
          to="/week/$weekKey"
          params={{ weekKey: shiftWeek(weekKey, 1) }}
          className="icon-btn"
          aria-label="Next week"
        >
          ›
        </Link>
      </div>
      {week.isPending ? (
        <Loading />
      ) : week.isError ? (
        <ErrorState error={week.error} onRetry={() => week.refetch()} />
      ) : (
        <WeekPlan key={weekKey} weekKey={weekKey} week={week.data} />
      )}
    </div>
  );
}
