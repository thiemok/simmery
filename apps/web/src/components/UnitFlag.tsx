import { useState } from 'react';
import { errorMessage } from '../api/errors';
import { useSaveIngredient, type Ingredient } from '../api/queries';
import { parseAmount } from '../lib/format';
import styles from './LineEditor.module.css';

type Mode = 'idle' | 'convert' | 'conversion';

/**
 * Shown on a line whose unit cannot be normalized (R6). "Convert" replaces the
 * line's amount and unit; "Add conversion" stores a factor on the ingredient.
 */
export function UnitFlag({
  unit,
  ingredient,
  onConvert,
  onConversionAdded,
}: {
  unit: string;
  ingredient: Ingredient;
  onConvert: (amount: number, unit: string) => void;
  onConversionAdded: (ingredient: Ingredient) => void;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [value, setValue] = useState('');
  const save = useSaveIngredient();
  const amount = parseAmount(value);
  const canonical = ingredient.canonicalUnit;

  function addConversion() {
    if (amount === null) {
      return;
    }
    save.mutate(
      {
        id: ingredient.id,
        json: {
          name: ingredient.name,
          aliases: ingredient.aliases,
          canonicalUnit: canonical,
          packSizes: ingredient.packSizes,
          conversions: [...ingredient.conversions, { unit, factor: amount }],
        },
      },
      { onSuccess: onConversionAdded },
    );
  }

  return (
    <div className={styles.flag} role="alert">
      <p>
        <strong>
          “{unit}” cannot be turned into {canonical} for {ingredient.name}.
        </strong>{' '}
        Convert the amount or add a conversion before saving.
      </p>
      {mode === 'idle' && (
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => setMode('convert')}>
            Convert
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setMode('conversion')}>
            Add conversion
          </button>
        </div>
      )}
      {mode === 'convert' && (
        <div className="row">
          <label className="field">
            <span>Amount in {canonical}</span>
            <input
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={amount === null || amount < 0}
            onClick={() => amount !== null && onConvert(amount, canonical)}
          >
            Use {value || '…'} {canonical}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setMode('idle')}>
            Cancel
          </button>
        </div>
      )}
      {mode === 'conversion' && (
        <div className="row">
          <label className="field">
            <span>
              1 {unit} = how many {canonical}?
            </span>
            <input
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={amount === null || amount <= 0 || save.isPending}
            onClick={addConversion}
          >
            Save conversion
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setMode('idle')}>
            Cancel
          </button>
          {save.isError && <p className="field-error">{errorMessage(save.error)}</p>}
        </div>
      )}
    </div>
  );
}
