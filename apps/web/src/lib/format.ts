/** Amounts as stored are rounded to six places; the UI shows at most two. */
export function formatAmount(amount: number): string {
  return String(Math.round(amount * 100) / 100);
}

export const formatQuantity = (amount: number, unit: string) => `${formatAmount(amount)} ${unit}`;

export function formatDate(iso: string | null): string {
  if (!iso) {
    return 'never';
  }
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const splitList = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/** A number typed into a field, or null while it is empty or not a number. */
export function parseAmount(text: string): number | null {
  const value = Number(text.replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(value) ? null : value;
}
