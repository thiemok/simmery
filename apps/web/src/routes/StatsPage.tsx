import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useStatistics, type Statistics } from '../api/queries';
import { ErrorState, Loading } from '../components/states';
import { formatAmount, formatDate, formatQuantity } from '../lib/format';
import pages from './pages.module.css';

function Section({
  id,
  title,
  empty,
  children,
}: {
  id: string;
  title: string;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <section className={`card ${pages.section}`} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {empty ? <p className="soft">{empty}</p> : children}
    </section>
  );
}

function RecipeLink({ id, title }: { id: string; title: string }) {
  return (
    <Link to="/recipes/$id" params={{ id }}>
      {title}
    </Link>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return <span className={pages.bar} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />;
}

function WeekTrends({ weeks }: { weeks: Statistics['weeks'] }) {
  return (
    <table className={pages.table}>
      <thead>
        <tr>
          <th>Week</th>
          <th className={pages.num}>Shared</th>
          <th className={pages.num}>Leftover lines</th>
          <th className={pages.num}>Tags</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.weekKey}>
            <td className="mono">
              {week.weekKey}
              {week.frozen && <span className="soft"> · final</span>}
            </td>
            <td className={pages.num}>{week.evaluation.overlap.length}</td>
            <td className={pages.num}>
              {
                week.evaluation.lines.filter((line) => line.leftover !== null && line.leftover > 0)
                  .length
              }
            </td>
            <td className={pages.num}>{Object.keys(week.evaluation.tagCounts).length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsPage() {
  const stats = useStatistics();
  if (stats.isPending) {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }
  if (stats.isError) {
    return (
      <div className="page">
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
      </div>
    );
  }
  const { recipes, notCookedRecently, cooks, weeks, mostBought } = stats.data;
  const cooked = recipes.filter((recipe) => recipe.cookCount > 0);
  const rated = cooks.filter((cook) => cook.rating !== null);
  const maxCooks = Math.max(0, ...cooked.map((recipe) => recipe.cookCount));
  const maxWeeks = Math.max(0, ...mostBought.map((item) => item.weeks));

  return (
    <div className="page">
      <h1 tabIndex={-1}>Statistics</h1>
      <Section
        id="history-heading"
        title="Cook history"
        empty={cooked.length === 0 ? 'Nothing cooked yet.' : null}
      >
        <table className={pages.table}>
          <thead>
            <tr>
              <th>Recipe</th>
              <th className={pages.num}>Cooked</th>
              <th>Last</th>
              <th className={pages.num}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {cooked.map((recipe) => (
              <tr key={recipe.recipeId}>
                <td>
                  <RecipeLink id={recipe.recipeId} title={recipe.title} />
                  <Bar value={recipe.cookCount} max={maxCooks} />
                </td>
                <td className={pages.num}>{recipe.cookCount}×</td>
                <td>{formatDate(recipe.lastCookedAt)}</td>
                <td className={pages.num}>
                  {recipe.averageRating === null ? '–' : `${formatAmount(recipe.averageRating)} ★`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section
        id="stale-heading"
        title="Not cooked in a while"
        empty={notCookedRecently.length === 0 ? 'Every recipe was cooked recently.' : null}
      >
        <ul className={pages.ingredients}>
          {notCookedRecently.map((recipe) => (
            <li key={recipe.recipeId}>
              <RecipeLink id={recipe.recipeId} title={recipe.title} />
              <span className="soft">last {formatDate(recipe.lastCookedAt)}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section
        id="ratings-heading"
        title="Ratings over time"
        empty={rated.length === 0 ? 'No ratings yet.' : null}
      >
        <ul className={pages.ingredients}>
          {rated.map((cook) => (
            <li key={cook.cookEventId}>
              <span className="amount">{formatDate(cook.cookedAt)}</span>
              <span>
                {cook.recipeTitle}{' '}
                <span aria-label={`${cook.rating} stars`}>{'★'.repeat(cook.rating ?? 0)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section
        id="bought-heading"
        title="Most bought"
        empty={mostBought.length === 0 ? 'No planned weeks yet.' : null}
      >
        <ul className={pages.ingredients}>
          {mostBought.map((item) => (
            <li key={item.ingredientId}>
              <span className="amount">{formatQuantity(item.total, item.unit)}</span>
              <span style={{ flex: 1 }}>
                {item.name} <span className="soft">· {item.weeks} weeks</span>
                <Bar value={item.weeks} max={maxWeeks} />
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section
        id="weeks-heading"
        title="Weeks"
        empty={weeks.length === 0 ? 'No planned weeks yet.' : null}
      >
        <WeekTrends weeks={weeks} />
      </Section>
    </div>
  );
}
