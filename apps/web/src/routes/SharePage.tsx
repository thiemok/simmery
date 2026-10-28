import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, isApiError, unresolvedLines } from '../api/errors';
import {
  useImportShared,
  useIngredients,
  useMe,
  useSharedRecipe,
  type ImportLineMapping,
  type Ingredient,
  type SharedRecipe,
} from '../api/queries';
import { matchesExactly } from '../components/IngredientPicker';
import {
  LineEditor,
  lineAmount,
  lineBlocked,
  newLineKey,
  type DraftLine,
} from '../components/LineEditor';
import { ErrorState, Loading, Notice } from '../components/states';
import { SkyHero, Wordmark } from '../components/SunMark';
import { signInUrl } from '../lib/session';
import { IngredientList } from './RecipeDetailPage';
import pages from './pages.module.css';
import styles from './SharePage.module.css';

type SourceLine = SharedRecipe['lines'][number];

/** One source line: the catalog entry whose name or alias equals the source name is suggested. */
function ImportRow({
  source,
  line,
  index,
  serverFlagged,
  onChange,
  onIngredientUpdated,
}: {
  source: SourceLine;
  line: DraftLine;
  index: number;
  serverFlagged: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onIngredientUpdated: (ingredient: Ingredient) => void;
}) {
  const matches = useIngredients(source.ingredientName);
  const suggested = useRef(false);
  useEffect(() => {
    if (suggested.current || !matches.data) {
      return;
    }
    suggested.current = true;
    const match = matches.data.find((ingredient) =>
      matchesExactly(ingredient, source.ingredientName),
    );
    if (match && !line.ingredient) {
      onChange({ ingredient: match });
    }
  }, [matches.data, source.ingredientName, line.ingredient, onChange]);

  return (
    <div className={styles.row}>
      <p className={styles.source}>
        <span className="amount">
          {source.amount} {source.unit}
        </span>{' '}
        {source.ingredientName}
      </p>
      <ul>
        <LineEditor
          line={line}
          index={index}
          editableQuantity={false}
          serverFlagged={serverFlagged}
          onChange={onChange}
          onIngredientUpdated={onIngredientUpdated}
        />
      </ul>
    </div>
  );
}

/** Maps every shared line to the importer's catalog, with the same unit checks as the editor (R24). */
function ImportWizard({
  token,
  recipe,
  onCancel,
}: {
  token: string;
  recipe: SharedRecipe;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    recipe.lines.map((source) => ({
      key: newLineKey(),
      ingredient: null,
      amount: String(source.amount),
      unit: source.unit,
      note: source.note ?? '',
    })),
  );
  const [serverFlags, setServerFlags] = useState<Set<number>>(new Set());
  const importRecipe = useImportShared(token);
  const navigate = useNavigate();
  const ready = lines.every(
    (line, index) => line.ingredient && !lineBlocked(line, serverFlags.has(index)),
  );

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setServerFlags((flags) => {
      const next = new Set(flags);
      next.delete(index);
      return next;
    });
    setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  }

  function ingredientUpdated(ingredient: Ingredient) {
    setServerFlags(new Set());
    setLines((current) =>
      current.map((line) =>
        line.ingredient?.id === ingredient.id ? { ...line, ingredient } : line,
      ),
    );
  }

  function submit() {
    const mappings: ImportLineMapping[] = lines.map((line, index) => {
      const source = recipe.lines[index];
      const amount = lineAmount(line) ?? source.amount;
      const converted = amount !== source.amount || line.unit !== source.unit;
      return {
        ingredientId: line.ingredient?.id ?? '',
        ...(converted ? { amount, unit: line.unit } : {}),
      };
    });
    importRecipe.mutate(mappings, {
      onSuccess: (created) => navigate({ to: '/recipes/$id', params: { id: created.id } }),
      onError: (error) => setServerFlags(new Set(unresolvedLines(error).map(({ index }) => index))),
    });
  }

  return (
    <section className={pages.section} aria-labelledby="import-heading">
      <h2 id="import-heading">Import into your recipes</h2>
      <p className="soft">Match each ingredient to your catalog, or create it.</p>
      <ol className={pages.list}>
        {recipe.lines.map((source, index) => (
          <li key={lines[index].key}>
            <ImportRow
              source={source}
              line={lines[index]}
              index={index}
              serverFlagged={serverFlags.has(index)}
              onChange={(patch) => updateLine(index, patch)}
              onIngredientUpdated={ingredientUpdated}
            />
          </li>
        ))}
      </ol>
      {importRecipe.isError && unresolvedLines(importRecipe.error).length === 0 && (
        <Notice>{errorMessage(importRecipe.error)}</Notice>
      )}
      <div className={pages.actions}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready || importRecipe.isPending}
          onClick={submit}
        >
          Import recipe
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/** The public share view (R23); importing needs a session (R24). */
export function SharePage({ token }: { token: string }) {
  const shared = useSharedRecipe(token);
  const me = useMe({ signedOutOk: true });
  const [importing, setImporting] = useState(false);
  const signedIn = Boolean(me.data);

  let content;
  if (shared.isPending) {
    content = <Loading />;
  } else if (isApiError(shared.error, 410)) {
    content = (
      <div className={pages.section}>
        <h1 tabIndex={-1}>No longer shared</h1>
        <p>The owner stopped sharing this recipe.</p>
      </div>
    );
  } else if (isApiError(shared.error, 404)) {
    content = (
      <div className={pages.section}>
        <h1 tabIndex={-1}>Recipe not found</h1>
        <p>Check that the link is complete.</p>
      </div>
    );
  } else if (shared.isError) {
    content = <ErrorState error={shared.error} onRetry={() => shared.refetch()} />;
  } else {
    const recipe = shared.data;
    content = (
      <article className="page" style={{ padding: 0 }}>
        <SkyHero />
        <h1 tabIndex={-1}>{recipe.title}</h1>
        {recipe.tags.length > 0 && (
          <ul className="row" aria-label="Tags">
            {recipe.tags.map((tag) => (
              <li key={tag} className="chip">
                {tag}
              </li>
            ))}
          </ul>
        )}
        {importing ? (
          <ImportWizard token={token} recipe={recipe} onCancel={() => setImporting(false)} />
        ) : (
          <>
            <div className={pages.actions}>
              {signedIn ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setImporting(true)}
                >
                  Import
                </button>
              ) : (
                !me.isPending && (
                  <a className="btn btn-primary" href={signInUrl(`/s/${token}`)}>
                    Sign in to import
                  </a>
                )
              )}
            </div>
            <section className={pages.section} aria-labelledby="shared-ingredients">
              <h2 id="shared-ingredients">Ingredients · {recipe.servings} servings</h2>
              <IngredientList lines={recipe.lines} />
            </section>
            <section className={pages.section} aria-labelledby="shared-steps">
              <h2 id="shared-steps">Steps</h2>
              <ol className={pages.steps}>
                {recipe.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </section>
            {recipe.sourceUrl && (
              <p>
                Source:{' '}
                <a href={recipe.sourceUrl} target="_blank" rel="noreferrer noopener">
                  {new URL(recipe.sourceUrl).hostname}
                </a>
              </p>
            )}
          </>
        )}
      </article>
    );
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <a href="/" className={styles.brand}>
          <Wordmark />
        </a>
      </header>
      <main className="page">{content}</main>
    </div>
  );
}
