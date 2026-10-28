import styles from './Stepper.module.css';

export function Stepper({
  value,
  onChange,
  label,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (value: number) => void;
  /** What the value counts, for the button names ("servings"). */
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <span className={styles.stepper} role="group" aria-label={label}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output className={styles.value} aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="icon-btn"
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </span>
  );
}
