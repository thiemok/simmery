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

const MICRO = 1e6;
const STATE_BUDGET = 1_000_000;
// Search granularities in micro-units: exact, then 1/1000 of a unit, then whole units.
const STEPS = [1, 1e3, 1e6];

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

function singleSizeFit(sizes: readonly number[], needed: number): PackFit {
  let best = { index: 0, count: Infinity, excess: Infinity };
  for (const [index, size] of sizes.entries()) {
    const count = Math.ceil(needed / size);
    const excess = count * size - needed;
    if (excess < best.excess || (excess === best.excess && count < best.count)) {
      best = { index, count, excess };
    }
  }
  const counts = sizes.map((_, index) => (index === best.index ? best.count : 0));
  return toFit(sizes, counts, needed);
}

/**
 * Exact least-excess search on a grid of `step` micro-units. Pack sizes round down and the need
 * rounds up, so any combination found still covers the real need. Returns null when the grid
 * would exceed the state budget.
 */
function searchCounts(sizes: readonly number[], needed: number, step: number): number[] | null {
  const scaled = sizes.map((size) => Math.floor(Math.round(size * MICRO) / step));
  if (scaled.some((size) => size === 0)) return null;
  const divisor = scaled.reduce(gcd);
  const units = scaled.map((size) => size / divisor);
  const target = Math.ceil(Math.ceil(Math.round(needed * MICRO) / step) / divisor);
  const limit = target + (units[0] ?? 0);
  if (!Number.isSafeInteger(limit) || limit > STATE_BUDGET) return null;

  // Sizes are sorted descending and only strictly fewer packs replace an entry, so ties keep larger packs.
  const fewestPacks = new Int32Array(limit + 1).fill(-1);
  const lastPackIndex = new Int32Array(limit + 1);
  fewestPacks[0] = 0;
  let sum = 0;
  while (sum < target || fewestPacks[sum] === -1) {
    sum++;
    for (let index = 0; index < units.length; index++) {
      const previous = sum - units[index];
      if (previous < 0 || fewestPacks[previous] === -1) continue;
      const count = fewestPacks[previous] + 1;
      if (fewestPacks[sum] === -1 || count < fewestPacks[sum]) {
        fewestPacks[sum] = count;
        lastPackIndex[sum] = index;
      }
    }
  }

  const counts = sizes.map(() => 0);
  while (sum > 0) {
    const index = lastPackIndex[sum];
    counts[index]++;
    sum -= units[index];
  }
  return counts;
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

  for (const step of STEPS) {
    const counts = searchCounts(sizes, needed, step);
    if (counts) return toFit(sizes, counts, needed);
  }
  return singleSizeFit(sizes, needed);
}
