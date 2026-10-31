import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useRecipes, useRestoreRecipe } from '../api/queries';
import { Empty, ErrorState, Loading } from '../components/states';
import { useDebounced } from '../lib/use-debounced';
import styles from './pages.module.css';

export function RecipesPage() {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [archived, setArchived] = useState(false);
  const search = useDebounced(query.trim(), 250);
  const recipes = useRecipes({ query: search, tag, archived });
  const restore = useRestoreRecipe();
  const tags = [...new Set((recipes.data ?? []).flatMap((recipe) => recipe.tags))].sort();

  return (
    <div className="page">
      <div className={styles.head}>
        <h1 tabIndex={-1}>{archived ? 'Archived recipes' : 'Recipes'}</h1>
        <Link to="/recipes/new" className="btn btn-primary">
          New recipe
        </Link>
      </div>
      <div className={styles.filters}>
        <label className="field">
          <span>Search</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>
      {(tags.length > 0 || tag) && (
        <div className="row" role="group" aria-label="Filter by tag">
          {tag && (
            <button type="button" className="chip" onClick={() => setTag('')}>
              {tag} ×
            </button>
          )}
          {tags
            .filter((candidate) => candidate !== tag)
            .map((candidate) => (
              <button
                key={candidate}
                type="button"
                className="chip"
                onClick={() => setTag(candidate)}
              >
                {candidate}
              </button>
            ))}
        </div>
      )}
      {recipes.isPending ? (
        <Loading />
      ) : recipes.isError ? (
        <ErrorState error={recipes.error} onRetry={() => recipes.refetch()} />
      ) : recipes.data.length === 0 ? (
        <Empty title={search || tag || archived ? 'No recipes match.' : 'No recipes yet.'}>
          {!archived && (
            <Link to="/recipes/new" className="btn btn-secondary">
              Add your first recipe
            </Link>
          )}
        </Empty>
      ) : (
        <ul className={styles.list}>
          {recipes.data.map((recipe) => (
            <li key={recipe.id} className={`card ${styles.item}`}>
              <Link to="/recipes/$id" params={{ id: recipe.id }} className={styles.itemLink}>
                <b>{recipe.title}</b>
                <small className="soft">
                  {recipe.servings} servings
                  {recipe.tags.length > 0 && ` · ${recipe.tags.join(', ')}`}
                </small>
              </Link>
              {archived && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(recipe.id)}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
