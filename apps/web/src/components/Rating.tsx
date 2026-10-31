import styles from './Rating.module.css';

/** One to five stars; pressing the current rating again clears it. */
export function Rating({
  value,
  onChange,
  label = 'Rating',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string;
}) {
  return (
    <span className={styles.rating} role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={styles.star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          aria-pressed={value === star}
          data-on={value !== null && star <= value}
          onClick={() => onChange(value === star ? null : star)}
        >
          {value !== null && star <= value ? '★' : '☆'}
        </button>
      ))}
    </span>
  );
}
