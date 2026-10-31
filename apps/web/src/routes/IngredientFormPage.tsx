import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { conflictReason, conflictMessage, errorMessage, fieldIssues } from '../api/errors';
import { useIngredient, useSaveIngredient, type Ingredient } from '../api/queries';
import { ErrorState, Loading, Notice } from '../components/states';
import { parseAmount, splitList } from '../lib/format';
import { Field } from '../components/Field';
import styles from './pages.module.css';

interface ConversionDraft {
  unit: string;
  factor: string;
}

function IngredientForm({ initial }: { initial?: Ingredient }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [aliases, setAliases] = useState(initial?.aliases.join(', ') ?? '');
  const [canonicalUnit, setCanonicalUnit] = useState(initial?.canonicalUnit ?? '');
  const [packSizes, setPackSizes] = useState(initial?.packSizes.join(', ') ?? '');
  const [conversions, setConversions] = useState<ConversionDraft[]>(
    initial?.conversions.map((c) => ({ unit: c.unit, factor: String(c.factor) })) ?? [],
  );
  const save = useSaveIngredient();
  const navigate = useNavigate();
  const issues = fieldIssues(save.error);
  const conflict = conflictReason(save.error);
  const packs = splitList(packSizes).map(parseAmount);
  const factors = conversions.map((c) => parseAmount(c.factor));
  const valid =
    name.trim() !== '' &&
    canonicalUnit.trim() !== '' &&
    packs.every((pack) => pack !== null) &&
    conversions.every((c, index) => c.unit.trim() !== '' && factors[index] !== null);

  function submit() {
    save.mutate(
      {
        id: initial?.id,
        json: {
          name: name.trim(),
          aliases: splitList(aliases),
          canonicalUnit: canonicalUnit.trim(),
          packSizes: packs as number[],
          conversions: conversions.map((c, index) => ({
            unit: c.unit.trim(),
            factor: factors[index] as number,
          })),
        },
      },
      { onSuccess: () => navigate({ to: '/catalog' }) },
    );
  }

  const updateConversion = (index: number, patch: Partial<ConversionDraft>) =>
    setConversions((current) => current.map((c, at) => (at === index ? { ...c, ...patch } : c)));

  return (
    <form
      className={`page ${styles.form}`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h1 tabIndex={-1}>{initial ? initial.name : 'New ingredient'}</h1>
      <Field
        label="Name"
        error={issues.name ?? (conflict === 'duplicate_name' ? conflictMessage(conflict) : null)}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Aliases (comma separated)" error={issues.aliases}>
        <input value={aliases} onChange={(event) => setAliases(event.target.value)} />
      </Field>
      <Field
        label="Canonical unit"
        error={
          issues.canonicalUnit ??
          (conflict === 'canonical_unit_in_use' ? conflictMessage(conflict) : null)
        }
      >
        <input value={canonicalUnit} onChange={(event) => setCanonicalUnit(event.target.value)} />
      </Field>
      <label className="field">
        <span>Pack sizes in {canonicalUnit || 'the canonical unit'} (comma separated)</span>
        <input
          inputMode="decimal"
          value={packSizes}
          onChange={(event) => setPackSizes(event.target.value)}
        />
      </label>
      <section className={styles.section} aria-labelledby="conversions-heading">
        <h2 id="conversions-heading">Conversions</h2>
        <p className="soft">
          How many {canonicalUnit || 'canonical units'} one of another unit is.
        </p>
        <ul className={styles.list}>
          {conversions.map((conversion, index) => (
            <li key={index} className="row">
              <span>1</span>
              <input
                className={`input ${styles.short}`}
                aria-label={`Conversion ${index + 1} unit`}
                value={conversion.unit}
                onChange={(event) => updateConversion(index, { unit: event.target.value })}
              />
              <span>=</span>
              <input
                className={`input ${styles.short}`}
                inputMode="decimal"
                aria-label={`Conversion ${index + 1} factor`}
                value={conversion.factor}
                onChange={(event) => updateConversion(index, { factor: event.target.value })}
              />
              <span className="mono">{canonicalUnit}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove conversion ${index + 1}`}
                onClick={() => setConversions((current) => current.filter((_, at) => at !== index))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConversions((current) => [...current, { unit: '', factor: '' }])}
          >
            Add conversion
          </button>
        </div>
      </section>
      {conflict && conflict !== 'duplicate_name' && conflict !== 'canonical_unit_in_use' && (
        <Notice>{conflictMessage(conflict)}</Notice>
      )}
      {save.isError && !conflict && Object.keys(issues).length === 0 && (
        <Notice>{errorMessage(save.error)}</Notice>
      )}
      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={!valid || save.isPending}>
          Save ingredient
        </button>
      </div>
    </form>
  );
}

export function IngredientFormPage({ id }: { id?: string }) {
  if (!id) {
    return <IngredientForm />;
  }
  return <EditIngredient id={id} />;
}

function EditIngredient({ id }: { id: string }) {
  const ingredient = useIngredient(id);
  if (ingredient.isError) {
    return (
      <div className="page">
        <ErrorState error={ingredient.error} onRetry={() => ingredient.refetch()} />
      </div>
    );
  }
  if (!ingredient.data) {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }
  return <IngredientForm initial={ingredient.data} />;
}
