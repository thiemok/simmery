import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';

/**
 * A labelled control whose error is linked by `aria-describedby`, so the message
 * never becomes part of the control's name.
 */
export function Field({
  label,
  error,
  className = '',
  children,
}: {
  label: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-describedby': error ? `${id}-error` : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
