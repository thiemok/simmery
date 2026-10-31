import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { errorMessage } from '../api/errors';
import { useCookView, useDeleteCookEvent, useMarkCooked, useRateCookEvent } from '../api/queries';
import { ErrorState, Loading, Notice } from '../components/states';
import { Rating } from '../components/Rating';
import { formatDateTime } from '../lib/format';
import { IngredientList } from './RecipeDetailPage';
import pages from './pages.module.css';
import styles from './CookPage.module.css';

export function CookPage({ entryId }: { entryId: string }) {
  const view = useCookView(entryId);
  const [mode, setMode] = useState<'steps' | 'list'>('steps');
  const [step, setStep] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const markCooked = useMarkCooked(entryId);
  const rate = useRateCookEvent(entryId);
  const undo = useDeleteCookEvent(entryId);

  if (view.isPending) {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }
  if (view.isError) {
    return (
      <div className="page">
        <ErrorState error={view.error} onRetry={() => view.refetch()} />
      </div>
    );
  }
  const { entry, recipe, cookEvents } = view.data;
  const steps = recipe.steps;
  const current = Math.min(step, Math.max(steps.length - 1, 0));
  const mutationError = markCooked.error ?? rate.error ?? undo.error;

  return (
    <article className="page">
      <div>
        <Link to="/week/$weekKey" params={{ weekKey: entry.weekKey }} className="btn btn-quiet">
          ‹ Back to the week
        </Link>
        <h1 tabIndex={-1}>{recipe.title}</h1>
        <p className="soft">{recipe.servings} servings</p>
      </div>

      <section className={pages.section} aria-labelledby="cook-ingredients">
        <h2 id="cook-ingredients">Ingredients</h2>
        <IngredientList lines={recipe.lines} />
      </section>

      <section className={pages.section} aria-labelledby="cook-steps">
        <div className={pages.head}>
          <h2 id="cook-steps">Steps</h2>
          <div className="row" role="group" aria-label="Show steps">
            <button
              type="button"
              className="btn btn-quiet"
              aria-pressed={mode === 'steps'}
              onClick={() => setMode('steps')}
            >
              One at a time
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              aria-pressed={mode === 'list'}
              onClick={() => setMode('list')}
            >
              All steps
            </button>
          </div>
        </div>
        {mode === 'steps' && steps.length > 0 ? (
          <div className={styles.stepper}>
            <div className={styles.dots} aria-hidden="true">
              {steps.map((_, index) => (
                <i
                  key={index}
                  data-state={index < current ? 'done' : index === current ? 'current' : 'next'}
                />
              ))}
            </div>
            <p className={styles.stepLabel}>
              Step {current + 1} of {steps.length}
            </p>
            <p className={styles.stepText} aria-live="polite">
              {steps[current]}
            </p>
            <div className={styles.stepNav}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={current === 0}
                onClick={() => setStep(current - 1)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={current === steps.length - 1}
                onClick={() => setStep(current + 1)}
              >
                Next step
              </button>
            </div>
          </div>
        ) : (
          <ol className={`${pages.steps} ${styles.listText}`}>
            {steps.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ol>
        )}
      </section>

      <section className={`card ${pages.section}`} aria-labelledby="cooked-heading">
        <h2 id="cooked-heading">Cooked it?</h2>
        <Rating value={rating} onChange={setRating} label="Rating for this cook" />
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={markCooked.isPending}
            onClick={() => markCooked.mutate(rating, { onSuccess: () => setRating(null) })}
          >
            Mark cooked
          </button>
        </div>
        {cookEvents.length > 0 && (
          <ul className={pages.list} aria-label="Cooked">
            {cookEvents.map((event) => (
              <li key={event.id} className={styles.event}>
                <span className={styles.cooked}>Cooked {formatDateTime(event.cookedAt)}</span>
                <Rating
                  value={event.rating}
                  label={`Rating for the cook on ${formatDateTime(event.cookedAt)}`}
                  onChange={(value) => rate.mutate({ id: event.id, rating: value })}
                />
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={undo.isPending}
                  onClick={() => undo.mutate(event.id)}
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
        {mutationError && <Notice>{errorMessage(mutationError)}</Notice>}
      </section>
    </article>
  );
}
