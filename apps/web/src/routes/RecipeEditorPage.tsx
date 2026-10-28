import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  conflictReason,
  conflictMessage,
  errorMessage,
  fieldIssues,
  unresolvedLines,
} from '../api/errors';
import {
  useIngredients,
  useRecipe,
  useSaveRecipe,
  type Ingredient,
  type Recipe,
  type RecipeInput,
} from '../api/queries';
import {
  LineEditor,
  lineAmount,
  lineBlocked,
  newLineKey,
  type DraftLine,
} from '../components/LineEditor';
import { ErrorState, Loading, Notice } from '../components/states';
import { Field } from '../components/Field';
import styles from './pages.module.css';

interface Draft {
  title: string;
  servings: string;
  lines: DraftLine[];
  steps: string[];
  tags: string[];
  sourceUrl: string;
}

const emptyLine = (): DraftLine => ({
  key: newLineKey(),
  ingredient: null,
  amount: '',
  unit: '',
  note: '',
});

function draftOf(recipe: Recipe | undefined, catalog: Ingredient[]): Draft {
  if (!recipe) {
    return { title: '', servings: '2', lines: [emptyLine()], steps: [''], tags: [], sourceUrl: '' };
  }
  const byId = new Map(catalog.map((ingredient) => [ingredient.id, ingredient]));
  return {
    title: recipe.title,
    servings: String(recipe.servings),
    lines: recipe.lines.map((line) => ({
      key: newLineKey(),
      ingredient: byId.get(line.ingredientId) ?? null,
      amount: String(line.amount),
      unit: line.unit,
      note: line.note ?? '',
    })),
    steps: recipe.steps,
    tags: recipe.tags,
    sourceUrl: recipe.sourceUrl ?? '',
  };
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function RecipeForm({ id, initial }: { id?: string; initial: Draft }) {
  const [draft, setDraft] = useState(initial);
  const [tagText, setTagText] = useState('');
  /** Keys of the lines the server last answered `unresolved_units` for; cleared when a line changes. */
  const [serverFlags, setServerFlags] = useState<Set<string>>(new Set());
  const save = useSaveRecipe(id);
  const navigate = useNavigate();
  const issues = fieldIssues(save.error);
  const conflict = conflictReason(save.error);

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setServerFlags((flags) => {
      const next = new Set(flags);
      next.delete(key);
      return next;
    });
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  }

  function ingredientUpdated(ingredient: Ingredient) {
    setServerFlags(new Set());
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.ingredient?.id === ingredient.id ? { ...line, ingredient } : line,
      ),
    }));
  }

  function addTag() {
    const tag = tagText.trim();
    if (tag && !draft.tags.includes(tag)) {
      update({ tags: [...draft.tags, tag] });
    }
    setTagText('');
  }

  const lines = draft.lines.filter((line) => line.ingredient || line.amount || line.unit);
  const incomplete = lines.some(
    (line) => !line.ingredient || lineAmount(line) === null || line.unit.trim() === '',
  );
  const blocked = lines.some((line) => lineBlocked(line, serverFlags.has(line.key)));

  function submit() {
    const input: RecipeInput = {
      title: draft.title,
      servings: Number(draft.servings),
      lines: lines.map((line) => ({
        ingredientId: line.ingredient?.id ?? '',
        amount: lineAmount(line) ?? 0,
        unit: line.unit.trim(),
        note: line.note.trim() || null,
      })),
      steps: draft.steps.map((step) => step.trim()).filter(Boolean),
      tags: draft.tags,
      sourceUrl: draft.sourceUrl.trim() || null,
    };
    save.mutate(input, {
      onSuccess: (recipe) => navigate({ to: '/recipes/$id', params: { id: recipe.id } }),
      onError: (error) =>
        setServerFlags(new Set(unresolvedLines(error).map(({ index }) => lines[index]?.key))),
    });
  }

  const generalError =
    save.isError && Object.keys(issues).length === 0 && unresolvedLines(save.error).length === 0;

  return (
    <form
      className={`page ${styles.form}`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h1 tabIndex={-1}>{id ? 'Edit recipe' : 'New recipe'}</h1>
      <div className={styles.grid2}>
        <Field label="Title" error={issues.title}>
          <input value={draft.title} onChange={(event) => update({ title: event.target.value })} />
        </Field>
        <Field label="Servings" error={issues.servings}>
          <input
            inputMode="numeric"
            value={draft.servings}
            onChange={(event) => update({ servings: event.target.value })}
          />
        </Field>
      </div>

      <section className={styles.section} aria-labelledby="lines-heading">
        <h2 id="lines-heading">Ingredients</h2>
        <ul className={styles.list}>
          {draft.lines.map((line, index) => {
            const at = lines.indexOf(line);
            return (
              <LineEditor
                key={line.key}
                line={line}
                index={index}
                serverFlagged={serverFlags.has(line.key)}
                errors={{
                  amount: issues[`lines[${at}].amount`],
                  unit: issues[`lines[${at}].unit`],
                  ingredient: issues[`lines[${at}].ingredientId`],
                }}
                onChange={(patch) => updateLine(line.key, patch)}
                onIngredientUpdated={ingredientUpdated}
                onRemove={() => update({ lines: draft.lines.filter((other) => other !== line) })}
              />
            );
          })}
        </ul>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => update({ lines: [...draft.lines, emptyLine()] })}
          >
            Add ingredient
          </button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="steps-heading">
        <h2 id="steps-heading">Steps</h2>
        <ol className={styles.list}>
          {draft.steps.map((step, index) => (
            <li key={index} className={styles.stepRow}>
              <Field label={`Step ${index + 1}`} error={issues[`steps[${index}]`]}>
                <textarea
                  value={step}
                  onChange={(event) =>
                    update({
                      steps: draft.steps.map((other, at) =>
                        at === index ? event.target.value : other,
                      ),
                    })
                  }
                />
              </Field>
              <span className="row">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move step ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => update({ steps: move(draft.steps, index, index - 1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move step ${index + 1} down`}
                  disabled={index === draft.steps.length - 1}
                  onClick={() => update({ steps: move(draft.steps, index, index + 1) })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() => update({ steps: draft.steps.filter((_, at) => at !== index) })}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => update({ steps: [...draft.steps, ''] })}
          >
            Add step
          </button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tags-heading">
        <h2 id="tags-heading">Tags</h2>
        {draft.tags.length > 0 && (
          <ul className="row">
            {draft.tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className="chip"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => update({ tags: draft.tags.filter((other) => other !== tag) })}
                >
                  {tag} ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <input
            className={`input ${styles.tagInput}`}
            aria-label="New tag"
            placeholder="e.g. vegetarian"
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTag();
              }
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={addTag}>
            Add tag
          </button>
        </div>
      </section>

      <Field label="Source URL (optional)" error={issues.sourceUrl}>
        <input
          type="url"
          value={draft.sourceUrl}
          onChange={(event) => update({ sourceUrl: event.target.value })}
        />
      </Field>

      {conflict && <Notice>{conflictMessage(conflict)}</Notice>}
      {generalError && !conflict && <Notice>{errorMessage(save.error)}</Notice>}
      {blocked && <p className="field-error">Resolve the flagged units before saving.</p>}
      <div className={styles.actions}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={blocked || incomplete || save.isPending}
        >
          Save recipe
        </button>
      </div>
    </form>
  );
}

export function RecipeEditorPage({ id }: { id?: string }) {
  const catalog = useIngredients();
  const recipe = useRecipe(id ?? '', undefined, { enabled: id !== undefined });
  const ready = catalog.data && (!id || recipe.data);
  const error = catalog.error ?? (id ? recipe.error : null);

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }
  return <RecipeForm id={id} initial={draftOf(id ? recipe.data : undefined, catalog.data)} />;
}
