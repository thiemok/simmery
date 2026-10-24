import { roundAmount } from './normalize.js';

export interface PackCount {
  size: number;
  count: number;
}

export interface PackFit {
  /** Largest pack size first. */
  packs: PackCount[];
  purchased: number;
  leftover: number;
}

const SCALE = 1e6;
const STATE_BUDGET = 1_000_000;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function toFit(sizes: readonly number[], counts: readonly number[], needed: number): PackFit {
  const packs = sizes
    .map((size, index) => ({ size, count: counts[index] ?? 0 }))
    .filter((pack) => pack.count > 0);
  const purchased = roundAmount(packs.reduce((sum, pack) => sum + pack.size * pack.count, 0));
  return { packs, purchased, leftover: roundAmount(purchased - needed) };
}

/** Best combination of a single pack size; used when the exact search would be too large. */
function singleSizeFit(sizes: readonly number[], needed: number): PackFit {
  let best: { index: number; count: number; excess: number } | undefined;
  sizes.forEach((size, index) => {
    const count = Math.ceil(needed / size);
    const excess = count * size - needed;
    if (!best || excess < best.excess || (excess === best.excess && count < best.count)) {
      best = { index, count, excess };
    }
  });
  const counts = sizes.map((_, index) => (index === best?.index ? best.count : 0));
  return toFit(sizes, counts, needed);
}

/**
 * Least-waste pack combination for a needed canonical amount (KTD7): least excess,
 * then fewest packs, then larger packs. Returns null when the ingredient has no pack sizes.
 */
export function packFit(needed: number, packSizes: readonly number[]): PackFit | null {
  if (!Number.isFinite(needed) || needed < 0) {
    throw new RangeError(`Needed amount must be a finite, non-negative number, got ${needed}`);
  }
  if (packSizes.some((size) => !Number.isFinite(size) || size <= 0)) {
    throw new RangeError(`Pack sizes must be finite and positive, got ${packSizes.join(', ')}`);
  }
  if (packSizes.length === 0) {
    return null;
  }

  const sizes = [...new Set(packSizes.map(roundAmount))].sort((a, b) => b - a);
  if (needed === 0) {
    return { packs: [], purchased: 0, leftover: 0 };
  }

  const scaled = sizes.map((size) => Math.round(size * SCALE));
  const divisor = scaled.reduce(gcd);
  const units = scaled.map((size) => size / divisor);
  const target = Math.ceil(Math.round(needed * SCALE) / divisor);
  const limit = target + (units[0] ?? 0);
  if (!Number.isSafeInteger(limit) || limit > STATE_BUDGET) {
    return singleSizeFit(sizes, needed);
  }

  // minPacks[s]: fewest packs summing to exactly s; lastPack[s]: index of the pack added last.
  // Sizes are sorted descending and only strictly fewer packs replace an entry, so ties keep larger packs.
  const minPacks = new Int32Array(limit + 1).fill(-1);
  const lastPack = new Int32Array(limit + 1);
  minPacks[0] = 0;
  for (let sum = 1; sum <= limit; sum++) {
    units.forEach((unit, index) => {
      const previous = sum - unit;
      if (previous < 0 || minPacks[previous] === -1) return;
      const count = minPacks[previous] + 1;
      if (minPacks[sum] === -1 || count < minPacks[sum]) {
        minPacks[sum] = count;
        lastPack[sum] = index;
      }
    });
  }

  let sum = target;
  while (minPacks[sum] === -1) sum++;

  const counts = sizes.map(() => 0);
  while (sum > 0) {
    const index = lastPack[sum];
    counts[index]++;
    sum -= units[index];
  }
  return toFit(sizes, counts, needed);
}
