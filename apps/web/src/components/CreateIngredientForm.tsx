import { useState } from 'react';
import { conflictReason, conflictMessage, errorMessage, fieldIssues } from '../api/errors';
import { useSaveIngredient, type Ingredient } from '../api/queries';
import { parseAmount, splitList } from '../lib/format';
import { Field } from './Field';
import styles from './LineEditor.module.css';

/** Creates a catalog ingredient inline from a recipe or import line (R9, Assumptions). */
export function CreateIngredientForm({
  name: initialName,
  unit,
  onCreated,
  onCancel,
}: {
  name: string;
  /** The line's unit, which prefills the canonical unit. */
  unit: string;
  onCreated: (ingredient: Ingredient) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [canonicalUnit, setCanonicalUnit] = useState(unit);
  const [packSizes, setPackSizes] = useState('');
  const save = useSaveIngredient();
  const issues = fieldIssues(save.error);
  const conflict = conflictReason(save.error);
  const packs = splitList(packSizes).map(parseAmount);
  const valid = name.trim() !== '' && canonicalUnit.trim() !== '' && packs.every((p) => p !== null);

  function submit() {
    save.mutate(
      {
        json: {
          name: name.trim(),
          canonicalUnit: canonicalUnit.trim(),
          packSizes: packs as number[],
        },
      },
      { onSuccess: onCreated },
    );
  }

  return (
    <div className={styles.inlineForm} role="group" aria-label="New ingredient">
      <Field
        label="Name"
        error={issues.name ?? (conflict === 'duplicate_name' ? conflictMessage(conflict) : null)}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Canonical unit" error={issues.canonicalUnit}>
        <input
          value={canonicalUnit}
          required
          onChange={(event) => setCanonicalUnit(event.target.value)}
        />
      </Field>
      <p className={`soft ${styles.hint}`}>
        Amounts are stored in this unit. It is fixed once recipes use the ingredient.
      </p>
      <label className="field">
        <span>Pack sizes (optional, in {canonicalUnit || 'the canonical unit'})</span>
        <input
          value={packSizes}
          inputMode="decimal"
          placeholder="e.g. 200, 500"
          onChange={(event) => setPackSizes(event.target.value)}
        />
      </label>
      {save.isError && !conflict && Object.keys(issues).length === 0 && (
        <p className="field-error">{errorMessage(save.error)}</p>
      )}
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || save.isPending}
          onClick={submit}
        >
          Create ingredient
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
