import { Transaction } from '../types';

// A single source of truth for money math so every page derives the same
// numbers from the same data (transactions), instead of divergent stored fields.

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
  return transactions.filter((t) => {
    const d = parseTxDate(t.date);
    return d !== null && d.getTime() >= start;
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

/** Spend per category (keyed by lower-cased category name) within the period. */
export function spentByCategory(
  transactions: Transaction[],
  period: Period,
  now: Date = new Date()
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of transactionsInPeriod(transactions, period, now)) {
    const spent = expenseAmount(t);
    if (spent === 0) continue;
    const key = t.category.toLowerCase();
    out[key] = (out[key] || 0) + spent;
  }
  return out;
}

/** Round a percentage to an integer, clamped to [0, 100]; safe for zero limits. */
export function usedPercent(spent: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((spent / limit) * 100)));
}

/** Map a Tailwind background class to a hex color for chart marks. */
export function hexFromColorClass(colorClass: string): string {
  const map: Record<string, string> = {
    'bg-orange-500': '#f97316',
    'bg-purple-500': '#a855f7',
    'bg-blue-500': '#3b82f6',
    'bg-teal-500': '#14b8a6',
    'bg-green-500': '#22c55e',
    'bg-red-500': '#ef4444',
    'bg-yellow-500': '#eab308',
    'bg-pink-500': '#ec4899',
  };
  return map[colorClass] || '#57605f';
}

/** Format a stored transaction date for display in fr-FR (falls back to raw). */
export function formatTxDate(dateStr: string): string {
  const d = parseTxDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
