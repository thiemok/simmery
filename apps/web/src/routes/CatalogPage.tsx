import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useIngredients } from '../api/queries';
import { Empty, ErrorState, Loading } from '../components/states';
import { useDebounced } from '../lib/use-debounced';
import styles from './pages.module.css';

export function CatalogPage() {
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim(), 250);
  const ingredients = useIngredients(search);

  return (
    <div className="page">
      <div className={styles.head}>
        <h1 tabIndex={-1}>Catalog</h1>
        <Link to="/catalog/new" className="btn btn-primary">
          New ingredient
        </Link>
      </div>
      <label className="field">
        <span>Search names and aliases</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {ingredients.isPending ? (
        <Loading />
      ) : ingredients.isError ? (
        <ErrorState error={ingredients.error} onRetry={() => ingredients.refetch()} />
      ) : ingredients.data.length === 0 ? (
        <Empty title={search ? 'No ingredients match.' : 'Your catalog is empty.'}>
          {!search && (
            <Link to="/catalog/new" className="btn btn-secondary">
              Add an ingredient
            </Link>
          )}
        </Empty>
      ) : (
        <ul className={styles.list}>
          {ingredients.data.map((ingredient) => (
            <li key={ingredient.id} className={`card ${styles.item}`}>
              <Link to="/catalog/$id" params={{ id: ingredient.id }} className={styles.itemLink}>
                <b>{ingredient.name}</b>
                <small className="soft">
                  <span className="mono">{ingredient.canonicalUnit}</span>
                  {ingredient.aliases.length > 0 && ` · also ${ingredient.aliases.join(', ')}`}
                  {ingredient.packSizes.length > 0 &&
                    ` · packs ${ingredient.packSizes.join(', ')} ${ingredient.canonicalUnit}`}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
