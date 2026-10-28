import { useId, useState, type KeyboardEvent } from 'react';
import { useIngredients, type Ingredient } from '../api/queries';
import { useDebounced } from '../lib/use-debounced';
import styles from './IngredientPicker.module.css';

const normal = (text: string) => text.trim().toLowerCase();

/** The alias that matched the typed text, when the name itself did not. */
function matchedAlias(ingredient: Ingredient, text: string): string | null {
  const term = normal(text);
  if (!term || normal(ingredient.name).includes(term)) {
    return null;
  }
  return ingredient.aliases.find((alias) => normal(alias).includes(term)) ?? null;
}

export const matchesExactly = (ingredient: Ingredient, text: string) =>
  [ingredient.name, ...ingredient.aliases].some((name) => normal(name) === normal(text));

type Option = { kind: 'ingredient'; ingredient: Ingredient } | { kind: 'create'; text: string };

/**
 * Autocompletes over the user's catalog, names and aliases (R9), following the
 * ARIA combobox pattern; offers to create an ingredient when nothing matches exactly.
 */
export function IngredientPicker({
  value,
  label,
  onSelect,
  onCreate,
}: {
  value: Ingredient | null;
  label: string;
  onSelect: (ingredient: Ingredient) => void;
  onCreate: (text: string) => void;
}) {
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = useDebounced(text.trim(), 200);
  const results = useIngredients(term);
  const listId = useId();
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (value) {
      setText(value.name);
    }
  }

  const ingredients = open && term ? (results.data ?? []) : [];
  const options: Option[] = ingredients.map((ingredient) => ({ kind: 'ingredient', ingredient }));
  if (open && term && results.data && !results.data.some((i) => matchesExactly(i, term))) {
    options.push({ kind: 'create', text: term });
  }
  const showList = open && options.length > 0;

  function choose(option: Option) {
    setOpen(false);
    if (option.kind === 'ingredient') {
      setText(option.ingredient.name);
      onSelect(option.ingredient);
    } else {
      onCreate(option.text);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && showList && active >= 0) {
      event.preventDefault();
      choose(options[Math.min(active, options.length - 1)]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.picker}>
      <input
        className="input"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        value={text}
        placeholder="Ingredient"
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <ul id={listId} role="listbox" className={styles.list} hidden={!showList}>
        {options.map((option, index) => (
          <li
            key={option.kind === 'ingredient' ? option.ingredient.id : 'create'}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={styles.option}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(option);
            }}
          >
            {option.kind === 'ingredient' ? (
              <>
                <span>{option.ingredient.name}</span>
                {matchedAlias(option.ingredient, term) && (
                  <span className="soft"> (alias: {matchedAlias(option.ingredient, term)})</span>
                )}
                <span className={`mono soft ${styles.unit}`}>
                  {option.ingredient.canonicalUnit}
                </span>
              </>
            ) : (
              <span className={styles.create}>Create “{option.text}”</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
