import { useState } from 'react';
import type { Ingredient } from '../api/queries';
import { formatAmount, parseAmount } from '../lib/format';
import { isUnresolved } from '../lib/units';
import { CreateIngredientForm } from './CreateIngredientForm';
import { IngredientPicker } from './IngredientPicker';
import { Field } from './Field';
import styles from './LineEditor.module.css';
import { UnitFlag } from './UnitFlag';

export interface DraftLine {
  key: string;
  ingredient: Ingredient | null;
  amount: string;
  unit: string;
  note: string;
}

let nextKey = 0;
export const newLineKey = () => `line-${++nextKey}`;

export const lineAmount = (line: DraftLine) => parseAmount(line.amount);

/** Whether the line still blocks a save: flagged locally or by the server's last answer. */
export function lineBlocked(line: DraftLine, serverFlagged = false): boolean {
  return serverFlagged || isUnresolved(lineAmount(line), line.unit, line.ingredient);
}

/**
 * One ingredient line, shared by the recipe editor and the import wizard: the
 * catalog picker, inline creation, and the unit flag with its two fixes (R6, R9).
 */
export function LineEditor({
  line,
  index,
  onChange,
  onIngredientUpdated,
  onRemove,
  serverFlagged = false,
  errors = {},
  editableQuantity = true,
}: {
  line: DraftLine;
  index: number;
  onChange: (patch: Partial<DraftLine>) => void;
  /** A conversion was added: every line using the ingredient re-checks against it. */
  onIngredientUpdated: (ingredient: Ingredient) => void;
  onRemove?: () => void;
  serverFlagged?: boolean;
  errors?: { amount?: string; unit?: string; ingredient?: string };
  /** Off in the import wizard, where amount and unit change only through "Convert". */
  editableQuantity?: boolean;
}) {
  const [creating, setCreating] = useState<string | null>(null);
  const number = index + 1;
  const flagged = line.ingredient !== null && lineBlocked(line, serverFlagged);

  return (
    <li className={styles.line} data-flagged={flagged}>
      <div className={styles.fields}>
        {editableQuantity ? (
          <>
            <Field label="Amount" error={errors.amount}>
              <input
                aria-label={`Amount, line ${number}`}
                inputMode="decimal"
                value={line.amount}
                onChange={(event) => onChange({ amount: event.target.value })}
              />
            </Field>
            <Field label="Unit" error={errors.unit}>
              <input
                aria-label={`Unit, line ${number}`}
                value={line.unit}
                onChange={(event) => onChange({ unit: event.target.value })}
              />
            </Field>
          </>
        ) : (
          <span className={`amount ${styles.quantity}`}>
            {formatAmount(lineAmount(line) ?? 0)} {line.unit}
          </span>
        )}
        <div className={`field ${styles.ingredient}`}>
          <span>Ingredient</span>
          <IngredientPicker
            label={`Ingredient, line ${number}`}
            value={line.ingredient}
            onSelect={(ingredient) => {
              setCreating(null);
              onChange({ ingredient });
            }}
            onCreate={setCreating}
          />
          {errors.ingredient && <span className="field-error">{errors.ingredient}</span>}
        </div>
        {editableQuantity && (
          <label className={`field ${styles.note}`}>
            <span>Note</span>
            <input
              aria-label={`Note, line ${number}`}
              value={line.note}
              onChange={(event) => onChange({ note: event.target.value })}
            />
          </label>
        )}
        {onRemove && (
          <button
            type="button"
            className={`icon-btn ${styles.remove}`}
            aria-label={`Remove line ${number}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      {creating !== null && (
        <CreateIngredientForm
          name={creating}
          unit={line.unit}
          onCancel={() => setCreating(null)}
          onCreated={(ingredient) => {
            setCreating(null);
            onChange({ ingredient });
          }}
        />
      )}
      {flagged && line.ingredient && (
        <UnitFlag
          key={`${line.unit}|${line.ingredient.conversions.length}`}
          unit={line.unit}
          ingredient={line.ingredient}
          onConvert={(amount, unit) => onChange({ amount: String(amount), unit })}
          onConversionAdded={onIngredientUpdated}
        />
      )}
    </li>
  );
}
