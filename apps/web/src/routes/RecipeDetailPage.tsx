import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { errorMessage } from '../api/errors';
import {
  useArchiveRecipe,
  useCreateShareLink,
  useRecipe,
  useRestoreRecipe,
  useRevokeShareLink,
  useShareLinks,
  type Recipe,
} from '../api/queries';
import { ErrorState, Loading, Notice } from '../components/states';
import { Stepper } from '../components/Stepper';
import { SkyHero } from '../components/SunMark';
import { formatAmount } from '../lib/format';
import styles from './pages.module.css';

export function IngredientList({
  lines,
}: {
  lines:
    | Recipe['lines']
    | { ingredientName: string; amount: number; unit: string; note: string | null }[];
}) {
  return (
    <ul className={styles.ingredients}>
      {lines.map((line, index) => (
        <li key={index}>
          <span className="amount">
            {formatAmount(line.amount)} {line.unit}
          </span>
          <span>
            {line.ingredientName}
            {line.note && <span className="soft">, {line.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SharePanel({ recipeId }: { recipeId: string }) {
  const links = useShareLinks(recipeId);
  const create = useCreateShareLink(recipeId);
  const revoke = useRevokeShareLink(recipeId);
  const [copied, setCopied] = useState(false);
  const link = links.data?.[0];
  const url = link ? `${window.location.origin}/s/${link.token}` : null;

  return (
    <section className={`card ${styles.section}`} aria-labelledby="share-heading">
      <h2 id="share-heading">Share</h2>
      {links.isPending ? (
        <Loading />
      ) : url && link ? (
        <>
          <p className="soft">Anyone with this link can read the recipe and import a copy.</p>
          <input className="input mono" readOnly value={url} aria-label="Share link" />
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                navigator.clipboard.writeText(url).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(link.id)}
            >
              Stop sharing
            </button>
          </div>
        </>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            Create share link
          </button>
        </div>
      )}
      {(create.isError || revoke.isError) && (
        <Notice>{errorMessage(create.error ?? revoke.error)}</Notice>
      )}
    </section>
  );
}

export function RecipeDetailPage({ id }: { id: string }) {
  const [servings, setServings] = useState<number | undefined>(undefined);
  const recipe = useRecipe(id, servings);
  const archive = useArchiveRecipe();
  const restore = useRestoreRecipe();
  const navigate = useNavigate();

  if (recipe.isPending && !recipe.data) {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }
  if (recipe.isError) {
    return (
      <div className="page">
        <ErrorState error={recipe.error} onRetry={() => recipe.refetch()} />
      </div>
    );
  }
  const data = recipe.data;

  return (
    <article className="page">
      <SkyHero />
      <h1 tabIndex={-1}>{data.title}</h1>
      {data.archivedAt && (
        <Notice>
          This recipe is archived.{' '}
          <button type="button" className="btn btn-secondary" onClick={() => restore.mutate(id)}>
            Restore
          </button>
        </Notice>
      )}
      {data.tags.length > 0 && (
        <ul className="row" aria-label="Tags">
          {data.tags.map((tag) => (
            <li key={tag} className="chip">
              {tag}
            </li>
          ))}
        </ul>
      )}
      <section className={styles.section} aria-labelledby="ingredients-heading">
        <div className={styles.head}>
          <h2 id="ingredients-heading">Ingredients</h2>
          <Stepper label="servings" value={data.servings} onChange={setServings} />
        </div>
        <IngredientList lines={data.lines} />
      </section>
      <section className={styles.section} aria-labelledby="steps-heading">
        <h2 id="steps-heading">Steps</h2>
        <ol className={styles.steps}>
          {data.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </section>
      {data.sourceUrl && (
        <p>
          Source:{' '}
          <a href={data.sourceUrl} target="_blank" rel="noreferrer noopener">
            {new URL(data.sourceUrl).hostname}
          </a>
        </p>
      )}
      {!data.archivedAt && (
        <div className={styles.actions}>
          <Link to="/recipes/$id/edit" params={{ id }} className="btn btn-primary">
            Edit
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={archive.isPending}
            onClick={() => {
              if (window.confirm(`Archive “${data.title}”? You can restore it later.`)) {
                archive.mutate(id, { onSuccess: () => navigate({ to: '/recipes' }) });
              }
            }}
          >
            Archive
          </button>
        </div>
      )}
      {!data.archivedAt && <SharePanel recipeId={id} />}
    </article>
  );
}
