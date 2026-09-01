import { Transaction } from '../types';
import { CategorySlug, CategorySource, isValidSlug, isKnownSlug, slugFromLegacy, categoryById } from './taxonomy';

// A single source of truth for money math so every page derives the same
// numbers from the same data (transactions), instead of divergent stored fields.

/**
 * Authoritative category slug of a transaction: `categoryId` when present and
 * valid, otherwise mapped from the legacy free-string `category`.
 */
export function effectiveSlug(t: Pick<Transaction, 'category' | 'categoryId'>): string {
  return t.categoryId && isKnownSlug(t.categoryId) ? t.categoryId : slugFromLegacy(t.category);
}

/** Default grouping key for selectors: the effective taxonomy slug. */
export function slugKey(t: Transaction): string {
  return effectiveSlug(t);
}

export type Period = 'week' | 'month' | 'year';

/** Start of the given period, aligned to the calendar (Mon-week, 1st-of-month, Jan-1). */
export function periodStart(period: Period, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const dayFromMonday = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - dayFromMonday);
  } else if (period === 'month') {
    d.setDate(1);
  } else {
    d.setMonth(0, 1);
  }
  return d;
}

/** Exclusive end of the given period (start of the next period). */
export function periodEnd(period: Period, now: Date = new Date()): Date {
  const d = periodStart(period, now);
  if (period === 'week') d.setDate(d.getDate() + 7);
  else if (period === 'month') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

/** Parse a transaction date string (accepts 'YYYY-MM-DD' or full ISO). */
export function parseTxDate(dateStr: string): Date | null {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/** Normalize any date-ish input to a canonical ISO string; falls back to now. */
export function toISODate(input?: string): string {
  if (input) {
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** Expense magnitude of a transaction (positive number), 0 for income. */
export function expenseAmount(t: Pick<Transaction, 'amount'>): number {
  return t.amount < 0 ? -t.amount : 0;
}

/** Transactions whose date falls within the current period window. */
export function transactionsInPeriod(
  transactions: Transaction[],
  period: Period,
  now: Date = new Date()
): Transaction[] {
  const start = periodStart(period, now).getTime();
  const end = periodEnd(period, now).getTime();
  return transactions.filter((t) => {
    const d = parseTxDate(t.date);
    if (d === null) return false;
    const ts = d.getTime();
    // Bounded window [start, end): future-dated transactions do not leak in.
    return ts >= start && ts < end;
  });
}

/** Total spent (expenses only) within the period. */
export function totalSpent(
  transactions: Transaction[],
  period: Period,
  now: Date = new Date()
): number {
  return transactionsInPeriod(transactions, period, now).reduce(
    (sum, t) => sum + expenseAmount(t),
    0
  );
}

/**
 * Spend per category within the period, keyed by `keyOf` (default: the
 * transaction's effective taxonomy slug — pass a tier-rollup key to group for
 * the free tier).
 */
export function spentByCategory(
  transactions: Transaction[],
  period: Period,
  now: Date = new Date(),
  keyOf: (t: Transaction) => string = slugKey
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of transactionsInPeriod(transactions, period, now)) {
    const spent = expenseAmount(t);
    if (spent === 0) continue;
    const key = keyOf(t);
    out[key] = (out[key] || 0) + spent;
  }
  return out;
}

/**
 * Reference date for the monthly dashboard: now — or, when the current month
 * has no transactions at all, the month holding the most expense transactions
 * (latest wins a tie). A freshly imported statement then shows its dominant
 * month, not a spillover month with a stray transaction or two. Callers should
 * label the shown month when it isn't the current one.
 */
export function monthReference(transactions: Transaction[], now: Date = new Date()): Date {
  if (transactionsInPeriod(transactions, 'month', now).length > 0) return now;
  const counts = new Map<string, { count: number; ref: Date }>();
  for (const t of transactions) {
    const d = parseTxDate(t.date);
    if (!d || expenseAmount(t) === 0) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { count: 1, ref: d });
  }
  let best: { count: number; ref: Date } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.ref > best.ref)) {
      best = entry;
    }
  }
  return best?.ref ?? now;
}

/** One month of derived series data. `key` is 'YYYY-MM'; spend excludes income. */
export interface MonthPoint {
  key: string;
  label: string;      // e.g. 'nov.' — short fr-FR month
  start: Date;
  spend: number;      // total expenses (positive magnitude)
  income: number;     // total credits
  byCategory: Record<string, number>; // expenses per lower-cased category
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Per-month spend/income series for the `months` calendar months ending at the
 * month of `now` (inclusive), oldest first. Derived purely from transactions.
 */
export function monthlySeries(
  transactions: Transaction[],
  months: number,
  now: Date = new Date(),
  keyOf: (t: Transaction) => string = slugKey
): MonthPoint[] {
  const points: MonthPoint[] = [];
  const byKey = new Map<string, MonthPoint>();
  for (let i = months - 1; i >= 0; i--) {
    const start = periodStart('month', now);
    start.setMonth(start.getMonth() - i);
    const point: MonthPoint = {
      key: monthKey(start),
      label: start.toLocaleDateString('fr-FR', { month: 'short' }),
      start,
      spend: 0,
      income: 0,
      byCategory: {},
    };
    points.push(point);
    byKey.set(point.key, point);
  }
  for (const t of transactions) {
    const d = parseTxDate(t.date);
    if (!d) continue;
    const point = byKey.get(monthKey(d));
    if (!point) continue;
    if (t.amount > 0) {
      point.income += t.amount;
    } else {
      const spent = expenseAmount(t);
      point.spend += spent;
      const key = keyOf(t);
      point.byCategory[key] = (point.byCategory[key] || 0) + spent;
    }
  }
  return points;
}

/** Expense transactions of one category key within the period. */
export function transactionsForCategory(
  transactions: Transaction[],
  categoryKey: string,
  period: Period,
  now: Date = new Date(),
  keyOf: (t: Transaction) => string = slugKey
): Transaction[] {
  return transactionsInPeriod(transactions, period, now)
    .filter((t) => t.amount < 0 && keyOf(t) === categoryKey)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Round a percentage to an integer, clamped to [0, 100]; safe for zero limits. */
export function usedPercent(spent: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((spent / limit) * 100)));
}

/**
 * Map a Tailwind background class to a hex color for chart marks.
 * Hexes are chart-tuned (validated for CVD separation and lightness on the
 * app surface), so they differ slightly from the raw Tailwind values.
 */
export function hexFromColorClass(colorClass: string): string {
  const map: Record<string, string> = {
    'bg-orange-500': '#ea700d',
    'bg-purple-500': '#a855f7',
    'bg-blue-500': '#3b82f6',
    'bg-teal-500': '#0d9488',
    'bg-green-500': '#16a34a',
    'bg-red-500': '#dc2626',
    'bg-yellow-500': '#ca8a04',
    'bg-pink-500': '#ec4899',
  };
  return map[colorClass] || '#57605f';
}

/** Chart colors for the income-vs-spend comparison (validated pair). */
export const INCOME_COLOR = '#0f9d6b';
export const SPEND_COLOR = '#c2410c';

export interface SavingVerification {
  monthlyDelta: number;   // >0 = actual monthly saving vs before, <0 = spend went up
  beforeAvg: number;      // avg monthly category spend before completion
  afterAvg: number;       // avg monthly category spend after completion
  monthsAfter: number;    // full months measured after completion
}

/**
 * Data-verified challenge saving: compare a category's average monthly spend
 * in the (up to 3) full months before the challenge was completed with the
 * full months after. Returns null while there is no complete month after
 * completion to measure — "verification pending".
 */
export function verifyChallengeSaving(
  transactions: Transaction[],
  categoryId: string,
  completedAt: string,
  now: Date = new Date()
): SavingVerification | null {
  const completed = parseTxDate(completedAt);
  if (!completed) return null;

  // Full calendar months strictly after the completion month, up to now.
  const firstAfter = periodStart('month', completed);
  firstAfter.setMonth(firstAfter.getMonth() + 1);
  const currentMonthStart = periodStart('month', now);
  const monthsAfter: Date[] = [];
  for (const d = new Date(firstAfter); d < currentMonthStart && monthsAfter.length < 6; d.setMonth(d.getMonth() + 1)) {
    monthsAfter.push(new Date(d));
  }
  if (monthsAfter.length === 0) return null;

  const monthsBefore: Date[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = periodStart('month', completed);
    d.setMonth(d.getMonth() - i);
    monthsBefore.push(d);
  }

  const spendIn = (monthStart: Date) =>
    spentByCategory(transactions, 'month', monthStart)[categoryId] || 0;

  // Only count "before" months that actually have data for a fair baseline.
  const beforeValues = monthsBefore.map(spendIn).filter((v) => v > 0);
  if (beforeValues.length === 0) return null;

  const beforeAvg = beforeValues.reduce((s, v) => s + v, 0) / beforeValues.length;
  const afterAvg = monthsAfter.map(spendIn).reduce((s, v) => s + v, 0) / monthsAfter.length;

  return {
    monthlyDelta: Math.round((beforeAvg - afterAvg) * 100) / 100,
    beforeAvg: Math.round(beforeAvg * 100) / 100,
    afterAvg: Math.round(afterAvg * 100) / 100,
    monthsAfter: monthsAfter.length,
  };
}

/** Format a stored transaction date for display in fr-FR (falls back to raw). */
export function formatTxDate(dateStr: string): string {
  const d = parseTxDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Best-effort keyword → category mapping so imported/uncategorized transactions
// land in a real budget category instead of a catch-all. Matched against the
// transaction label, case-insensitively. Falls back to 'Autre'.
const CATEGORY_KEYWORDS: Array<{ category: string; words: string[] }> = [
  { category: 'Nourriture', words: ['carrefour', 'lidl', 'cora', 'auchan', 'monoprix', 'franprix', 'leclerc', 'intermarche', 'casino', 'boulangerie', 'restaurant', 'bistrot', 'mcdo', "mcdonald", 'burger', 'uber eats', 'deliveroo', 'boucherie', 'primeur'] },
  { category: 'Transport', words: ['sncf', 'ratp', 'uber', 'bolt', 'total', 'totalenergies', 'essence', 'station', 'parking', 'velib', 'blablacar', 'navigo', 'peage', 'shell', 'esso'] },
  { category: 'Abos', words: ['netflix', 'spotify', 'deezer', 'disney', 'canal', 'free', 'orange', 'sfr', 'bouygues', 'edf', 'engie', 'apple.com', 'icloud', 'google', 'prime', 'amazon music', 'youtube', 'assurance'] },
  { category: 'Loisirs', words: ['amazon', 'fnac', 'decathlon', 'cinema', 'steam', 'playstation', 'nintendo', 'cultura', 'zalando', 'vinted', 'sport'] },
];

/** Guess a budget category from a transaction label; 'Autre' when unknown. */
export function guessCategory(label: string): string {
  const l = (label || '').toLowerCase();
  for (const { category, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => l.includes(w))) return category;
  }
  return 'Autre';
}

// Keyword → taxonomy slug rules (pipeline step 3). More specific slugs than
// the legacy CATEGORY_KEYWORDS table; first match wins, order matters.
const SLUG_KEYWORDS: Array<{ slug: CategorySlug; words: string[] }> = [
  { slug: 'logement', words: ['loyer', 'immobilier', 'syndic', 'foncia', 'nexity'] },
  { slug: 'energie_telecom', words: ['edf', 'engie', 'totalenergies elec', 'free mobile', 'free telecom', 'orange', 'sfr', 'bouygues tel', 'sosh', 'red by'] },
  { slug: 'abonnements', words: ['netflix', 'spotify', 'deezer', 'disney', 'canal', 'apple.com', 'icloud', 'prime', 'amazon music', 'youtube', 'assurance', 'basic fit', 'abonnement'] },
  { slug: 'courses', words: ['carrefour', 'lidl', 'cora', 'auchan', 'monoprix', 'franprix', 'leclerc', 'intermarche', 'casino', 'boulangerie', 'boucherie', 'primeur', 'picard', 'grand frais'] },
  { slug: 'restaurants', words: ['restaurant', 'bistrot', 'mcdo', 'mcdonald', 'burger', 'uber eats', 'deliveroo', 'brasserie', 'pizzeria', 'sushi', 'kebab', 'cafe', 'café'] },
  { slug: 'transport', words: ['sncf', 'ratp', 'uber', 'bolt', 'total', 'essence', 'station', 'parking', 'velib', 'blablacar', 'navigo', 'peage', 'shell', 'esso', 'autoroute'] },
  { slug: 'sante', words: ['pharmacie', 'docteur', 'medecin', 'médecin', 'mutuelle', 'dentiste', 'laboratoire', 'hopital', 'hôpital'] },
  { slug: 'voyages', words: ['airbnb', 'booking', 'hotel', 'hôtel', 'air france', 'ryanair', 'easyjet', 'transavia'] },
  { slug: 'shopping', words: ['zalando', 'vinted', 'zara', 'h&m', 'uniqlo', 'kiabi', 'primark'] },
  { slug: 'loisirs', words: ['amazon', 'fnac', 'decathlon', 'cinema', 'cinéma', 'steam', 'playstation', 'nintendo', 'cultura', 'sport', 'concert'] },
  { slug: 'epargne_virements', words: ['epargne', 'épargne', 'livret', 'vir interne', 'virement interne'] },
];

/** Keyword-classify a label into a taxonomy slug; 'autre' when unknown. */
export function guessSlug(label: string): CategorySlug {
  const l = (label || '').toLowerCase();
  for (const { slug, words } of SLUG_KEYWORDS) {
    if (words.some((w) => l.includes(w))) return slug;
  }
  return 'autre';
}

/**
 * Categorize an imported transaction (docs/CATEGORY_ENGINE.md pipeline):
 * merchant rule → LLM-provided slug → keyword rules → default. Returns the
 * slug, its provenance, and the matching legacy display name.
 */
export function categorizeImport(
  label: string,
  amount: number,
  llmCategory: string | undefined,
  merchantRules: Map<string, string>,
  normalizedLabel: string
): { categoryId: CategorySlug; categorySource: CategorySource; category: string } {
  let categoryId: CategorySlug | null = null;
  let categorySource: CategorySource = 'default';

  const ruled = merchantRules.get(normalizedLabel);
  if (ruled && isValidSlug(ruled)) {
    categoryId = ruled;
    categorySource = 'rule';
  } else if (amount >= 0) {
    categoryId = 'revenus';
  } else if (llmCategory && isValidSlug(llmCategory.toLowerCase())) {
    categoryId = llmCategory.toLowerCase() as CategorySlug;
    categorySource = 'llm';
  } else {
    const guessed = llmCategory ? slugFromLegacy(llmCategory) : guessSlug(label);
    if (guessed !== 'autre') {
      categoryId = guessed;
      categorySource = llmCategory ? 'llm' : 'rule';
    } else {
      categoryId = guessSlug(label);
      categorySource = categoryId === 'autre' ? 'default' : 'rule';
    }
  }

  return {
    categoryId,
    categorySource,
    category: categoryById(categoryId)?.name ?? 'Autre',
  };
}
