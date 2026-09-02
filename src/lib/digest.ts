// Spending digest for /api/analyze (docs/CATEGORY_ENGINE.md phase 3).
//
// The LLM never receives the raw transaction dump: this module reduces it to a
// compact aggregate — per-category monthly totals, top merchants, and
// deterministically detected recurring payments. Detection is code, not
// prompt; the model only writes advice about what the code found.
//
// Shared by client and server; keep dependency-free besides taxonomy.

import { normalizeLabel, slugFromLegacy, isKnownSlug } from './taxonomy';

/** Minimal transaction shape the digest needs (subset of Transaction). */
export interface DigestTx {
  name: string;
  amount: number;
  date: string;
  category?: string;
  categoryId?: string;
}

export interface RecurringPayment {
  label: string;        // normalized merchant label
  categoryId: string;
  avgAmount: number;    // positive magnitude
  occurrences: number;
  lastDate: string;     // ISO date of most recent occurrence
}

export interface SpendingDigest {
  months: Array<{ month: string; spend: number; income: number; byCategory: Record<string, number> }>;
  topMerchants: Array<{ label: string; categoryId: string; total: number; count: number }>;
  recurring: RecurringPayment[];
}

function slugOf(t: DigestTx): string {
  return t.categoryId && isKnownSlug(t.categoryId) ? t.categoryId : slugFromLegacy(t.category);
}

/**
 * Detect recurring payments: same normalized label, at least `minOccurrences`
 * expenses at a roughly monthly cadence (median interval 20–40 days) with
 * stable amounts (max deviation ≤ 30% of the median amount).
 */
export function detectRecurring(transactions: DigestTx[], minOccurrences = 2): RecurringPayment[] {
  const groups = new Map<string, Array<{ time: number; amount: number; date: string; slug: string }>>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const label = normalizeLabel(t.name);
    if (!label) continue;
    const time = new Date(t.date).getTime();
    if (isNaN(time)) continue;
    const list = groups.get(label) || [];
    list.push({ time, amount: -t.amount, date: t.date, slug: slugOf(t) });
    groups.set(label, list);
  }

  const out: RecurringPayment[] = [];
  for (const [label, list] of groups) {
    if (list.length < minOccurrences) continue;
    list.sort((a, b) => a.time - b.time);

    const intervals = [];
    for (let i = 1; i < list.length; i++) {
      intervals.push((list[i].time - list[i - 1].time) / 86400000);
    }
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    if (medianInterval < 20 || medianInterval > 40) continue;

    const amounts = list.map((x) => x.amount).sort((a, b) => a - b);
    const medianAmount = amounts[Math.floor(amounts.length / 2)];
    if (medianAmount <= 0) continue;
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - medianAmount)));
    if (maxDeviation > medianAmount * 0.3) continue;

    const last = list[list.length - 1];
    out.push({
      label,
      categoryId: last.slug,
      avgAmount: Math.round((amounts.reduce((s, a) => s + a, 0) / amounts.length) * 100) / 100,
      occurrences: list.length,
      lastDate: last.date.slice(0, 10),
    });
  }
  return out.sort((a, b) => b.avgAmount - a.avgAmount);
}

/** Build the compact digest the analyze prompt consumes. */
export function buildSpendingDigest(transactions: DigestTx[], monthsBack = 6): SpendingDigest {
  const byMonth = new Map<string, { spend: number; income: number; byCategory: Record<string, number> }>();
  const merchants = new Map<string, { total: number; count: number; slug: string }>();

  for (const t of transactions) {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = byMonth.get(month) || { spend: 0, income: 0, byCategory: {} };
    if (t.amount > 0) {
      m.income += t.amount;
    } else {
      const spent = -t.amount;
      m.spend += spent;
      const slug = slugOf(t);
      m.byCategory[slug] = Math.round(((m.byCategory[slug] || 0) + spent) * 100) / 100;
      const label = normalizeLabel(t.name);
      if (label) {
        const mm = merchants.get(label) || { total: 0, count: 0, slug };
        mm.total += spent;
        mm.count++;
        merchants.set(label, mm);
      }
    }
    m.spend = Math.round(m.spend * 100) / 100;
    m.income = Math.round(m.income * 100) / 100;
    byMonth.set(month, m);
  }

  const months = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-monthsBack)
    .map(([month, m]) => ({ month, ...m }));

  const topMerchants = [...merchants.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([label, m]) => ({ label, categoryId: m.slug, total: Math.round(m.total * 100) / 100, count: m.count }));

  return { months, topMerchants, recurring: detectRecurring(transactions) };
}
