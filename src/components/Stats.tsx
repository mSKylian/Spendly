import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Lightbulb, Lock } from 'lucide-react';
import { SpendlyStore } from '../store';
import {
  Period,
  totalSpent,
  spentByCategory,
  usedPercent as computeUsedPercent,
  hexFromColorClass,
  periodSeries,
  periodStart,
  monthReference,
  transactionsForCategory,
  parseTxDate,
  formatTxDate,
  effectiveSlug,
  INCOME_COLOR,
  SPEND_COLOR,
} from '../lib/finance';
import { rollupSlug, displayMeta, SYSTEM_CATEGORIES, isCustomSlug, MAX_CUSTOM_CATEGORIES } from '../lib/taxonomy';
import type { Transaction } from '../types';
import { Plus } from 'lucide-react';

const CUSTOM_COLOR_OPTIONS = ['bg-orange-500', 'bg-pink-500', 'bg-blue-500', 'bg-teal-500', 'bg-purple-500', 'bg-yellow-500'];
const CUSTOM_ICON_OPTIONS = ['package', 'heart', 'music', 'car', 'shopping-bag', 'home'];

interface StatsProps {
  store: SpendlyStore;
}

type PeriodLabel = 'Semaine' | 'Mois' | 'Année';

const PERIOD_MAP: Record<PeriodLabel, Period> = {
  'Semaine': 'week',
  'Mois': 'month',
  'Année': 'year',
};

// Chart buckets per period: 8 weeks / 6 months / 3 years.
const PERIOD_BUCKETS: Record<Period, number> = { week: 8, month: 6, year: 3 };

export default function Stats({ store }: StatsProps) {
  const { transactions, categories, user, recategorizeTransaction, addCustomCategory } = store;
  const tier = user?.tier ?? 'free';
  // Slug-keyed grouping, rolled up to 4 groups + Autre on free tier.
  const keyOf = useMemo(() => (t: Transaction) => rollupSlug(effectiveSlug(t), tier), [tier]);
  // User-created categories (pro): docs whose id is a custom_* slug. Their
  // display metadata overrides the static taxonomy lookup.
  const customCats = useMemo(() => categories.filter(c => c.id && isCustomSlug(c.id)), [categories]);
  const metaFor = useMemo(() => (key: string) => {
    const custom = customCats.find(c => c.id === key);
    return custom
      ? { name: custom.name, colorClass: custom.colorClass, iconName: custom.iconName }
      : displayMeta(key, tier);
  }, [customCats, tier]);
  const [periodLabel, setPeriodLabel] = useState<PeriodLabel>('Mois');
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', colorClass: CUSTOM_COLOR_OPTIONS[0], iconName: CUSTOM_ICON_OPTIONS[0], limit: '' });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // Reference bucket tapped on a chart (a week/month/year start, per period).
  const [selectedRef, setSelectedRef] = useState<Date | null>(null);

  const period = PERIOD_MAP[periodLabel];

  const switchPeriod = (label: PeriodLabel) => {
    setPeriodLabel(label);
    setSelectedRef(null); // a week selection means nothing in month view
    setSelectedCategory(null);
  };

  // The chart window ends at the latest month that has data when that month is
  // ahead of today (freshly imported statements), otherwise at the current month.
  const chartAnchor = useMemo(() => {
    const now = new Date();
    let latest: Date | null = null;
    for (const t of transactions) {
      const d = parseTxDate(t.date);
      if (d && (!latest || d > latest)) latest = d;
    }
    return latest && latest > now ? latest : now;
  }, [transactions]);

  // Chart buckets follow the period selector: weeks, months, or years.
  const series = useMemo(
    () => periodSeries(transactions, period, PERIOD_BUCKETS[period], chartAnchor, keyOf),
    [transactions, period, chartAnchor, keyOf]
  );

  // Fixed categorical color assignment: order by total spend across the whole
  // window so a category keeps its color regardless of the selected month.
  const catMeta = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of series) {
      for (const [key, v] of Object.entries(p.byCategory)) {
        totals.set(key, (totals.get(key) || 0) + v);
      }
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => {
        const meta = metaFor(key);
        return { key, name: meta.name, color: hexFromColorClass(meta.colorClass) };
      });
  }, [series, metaFor]);

  // Reference date for the budget card and breakdown: the tapped chart bucket,
  // defaulting to the month-with-data fallback (month view, matching the
  // dashboard) or the chart anchor (week/year views).
  const refDate = useMemo(() => {
    if (selectedRef) return selectedRef;
    return period === 'month' ? monthReference(transactions) : chartAnchor;
  }, [selectedRef, period, transactions, chartAnchor]);
  const refLabel = useMemo(() => {
    const start = periodStart(period, refDate);
    if (period === 'week') return `semaine du ${start.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}`;
    if (period === 'month') return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return String(start.getFullYear());
  }, [period, refDate]);

  const data = useMemo(() => {
    const spent = totalSpent(transactions, period, refDate);
    const limit = user?.limits?.[period] ?? 0;
    const byCat = spentByCategory(transactions, period, refDate, keyOf);

    // Breakdown from every rollup key that actually has spend, so it always
    // sums to the total; display metadata comes from the taxonomy.
    const cats = Object.entries(byCat)
      .map(([key, amount]) => {
        const meta = metaFor(key);
        return { key, name: meta.name, amount, color: hexFromColorClass(meta.colorClass) };
      })
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map((c) => ({
        ...c,
        percent: spent > 0 ? Math.round((c.amount / spent) * 100) : 0,
      }));

    return {
      used: computeUsedPercent(spent, limit),
      remaining: Math.max(0, limit - spent),
      spent,
      categories: cats,
    };
  }, [transactions, user, period, refDate, keyOf, metaFor]);

  const drillDownTxs = useMemo(
    () => (selectedCategory ? transactionsForCategory(transactions, selectedCategory, period, refDate, keyOf) : []),
    [selectedCategory, transactions, period, refDate, keyOf]
  );

  const flowMax = Math.max(...series.map((p) => Math.max(p.income, p.spend)), 1);
  const stackMax = Math.max(...series.map((p) => p.spend), 1);
  const refKey = periodStart(period, refDate).toISOString().slice(0, 10);
  const selectedPoint = series.find((p) => p.key === refKey);

  const selectBucket = (start: Date) => {
    setSelectedRef(start);
    setSelectedCategory(null);
  };

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Period Selector */}
      <div className="flex bg-surface-container p-1.5 rounded-2xl self-center w-full max-w-sm mt-4 shadow-sm border border-white">
        {(['Semaine', 'Mois', 'Année'] as PeriodLabel[]).map((p) => (
          <button
            key={p}
            onClick={() => switchPeriod(p)}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200
              ${periodLabel === p ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-surface-container-high'}`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Income vs Spend */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex justify-between items-baseline mb-1">
          <h2 className="font-display font-extrabold text-base">Revenus vs Dépenses</h2>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-secondary">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />Revenus</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SPEND_COLOR }} />Dépenses</span>
          </div>
        </div>
        {selectedPoint && (
          <p className="text-[11px] font-bold text-secondary mb-3 tabular-nums">
            {refLabel} : +{selectedPoint.income.toLocaleString('fr-FR')} € / −{selectedPoint.spend.toLocaleString('fr-FR')} €
            <span className={`ml-2 ${selectedPoint.income - selectedPoint.spend >= 0 ? 'text-primary' : 'text-red-600'}`}>
              (net {(selectedPoint.income - selectedPoint.spend >= 0 ? '+' : '') + (selectedPoint.income - selectedPoint.spend).toLocaleString('fr-FR')} €)
            </span>
          </p>
        )}
        <div className="flex items-end justify-between gap-2 h-32 mt-2">
          {series.map((p) => {
            const isSel = selectedPoint?.key === p.key;
            return (
              <button
                key={p.key}
                onClick={() => selectBucket(p.start)}
                className="flex-1 flex flex-col items-center gap-1.5 group"
                aria-label={`${p.label} : revenus ${Math.round(p.income)} €, dépenses ${Math.round(p.spend)} €`}
              >
                <div className={`w-full flex items-end justify-center gap-[3px] h-24 rounded-lg px-1 transition-colors ${isSel ? 'bg-primary/5' : 'group-hover:bg-surface-container'}`}>
                  <div
                    className="w-2.5 rounded-t-[4px] transition-all"
                    style={{ height: `${Math.max((p.income / flowMax) * 100, p.income > 0 ? 4 : 0)}%`, backgroundColor: INCOME_COLOR }}
                  />
                  <div
                    className="w-2.5 rounded-t-[4px] transition-all"
                    style={{ height: `${Math.max((p.spend / flowMax) * 100, p.spend > 0 ? 4 : 0)}%`, backgroundColor: SPEND_COLOR }}
                  />
                </div>
                <span className={`text-[9px] font-extrabold uppercase ${isSel ? 'text-primary' : 'text-secondary opacity-70'}`}>{p.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Monthly spend trend, stacked by category */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
        <h2 className="font-display font-extrabold text-base mb-1">Tendance des dépenses</h2>
        <p className="text-[10px] uppercase font-bold text-secondary tracking-wider mb-3">Par catégorie · toucher une barre pour la détailler</p>
        <div className="flex items-end justify-between gap-2 h-36">
          {series.map((p) => {
            const isSel = selectedPoint?.key === p.key;
            return (
              <button
                key={p.key}
                onClick={() => selectBucket(p.start)}
                className="flex-1 flex flex-col items-center gap-1.5 group"
                aria-label={`${p.label} : ${Math.round(p.spend)} € dépensés`}
              >
                <div className={`w-full flex flex-col-reverse items-center h-28 rounded-lg px-1 pt-1 transition-colors ${isSel ? 'bg-primary/5' : 'group-hover:bg-surface-container'}`}>
                  {catMeta.map((c) => {
                    const v = p.byCategory[c.key] || 0;
                    if (v <= 0) return null;
                    return (
                      <div
                        key={c.key}
                        className="w-3.5 first:rounded-b-none last:rounded-t-[4px]"
                        style={{
                          height: `${(v / stackMax) * 100}%`,
                          backgroundColor: c.color,
                          marginTop: 2, // 2px surface gap between stacked segments
                        }}
                      />
                    );
                  })}
                </div>
                <span className={`text-[9px] font-extrabold uppercase ${isSel ? 'text-primary' : 'text-secondary opacity-70'}`}>{p.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4 pt-3 border-t border-surface-container">
          {catMeta.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5 text-[10px] font-bold text-secondary">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
      </section>

      {/* Global Budget Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex flex-col items-center gap-6">
        <div className="w-full flex justify-between items-start">
          <div>
            <h2 className="font-display font-extrabold text-base">Budget Global</h2>
            <p className="text-[10px] uppercase font-bold text-secondary tracking-wider">{refLabel}</p>
          </div>
          <Info className="text-primary hover:scale-110 transition-transform cursor-pointer" size={20} />
        </div>

        {/* Donut Chart */}
        <div className="relative w-48 h-48 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle cx="50%" cy="50%" r="42%" fill="transparent" stroke="#eeeeee" strokeWidth="12" />
            <motion.circle
               key={periodLabel}
               initial={{ strokeDashoffset: 282 }}
               animate={{ strokeDashoffset: 282.7 - (282.7 * data.used) / 100 }}
               transition={{ duration: 1, ease: 'easeOut' }}
               cx="50%" cy="50%" r="42%" fill="transparent" stroke="#005440" strokeWidth="12"
               strokeDasharray="282.7" strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              key={periodLabel}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="font-display text-4xl font-extrabold text-primary"
            >
              {data.used}%
            </motion.span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary -mt-1 opacity-60">Utilisé</span>
          </div>
        </div>

        <div className="grid grid-cols-2 w-full gap-8 border-t border-surface-container pt-6">
          <motion.div
            key={`${periodLabel}-remaining`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-1"
          >
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary">Budget Restant</span>
            <span className="font-display text-xl font-extrabold text-primary tracking-tight">
              {data.remaining.toLocaleString('fr-FR')} €
            </span>
          </motion.div>
          <motion.div
            key={`${periodLabel}-total`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-1 text-right"
          >
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary">Total Dépensé</span>
            <span className="font-display text-xl font-extrabold text-secondary tracking-tight">
              {data.spent.toLocaleString('fr-FR')} €
            </span>
          </motion.div>
        </div>
      </section>

      {/* Breakdown List */}
      <section>
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="font-display font-extrabold text-lg">Répartition par catégorie</h2>
          <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">{refLabel}</span>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] space-y-2">
          {data.categories.length === 0 && (
            <p className="text-sm font-medium text-secondary text-center py-6">
              Aucune dépense sur cette période.
            </p>
          )}
          <AnimatePresence mode="popLayout">
            {data.categories.map((cat) => (
              <motion.div
                key={cat.key}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`rounded-xl transition-all ${
                  selectedCategory === cat.key ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-surface-container-low'
                }`}
              >
                <div
                  onClick={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
                  className="flex items-center justify-between p-3 group cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <div className="flex flex-col">
                      <span className="font-bold text-sm tracking-tight">{cat.name}</span>
                      <span className="text-[10px] font-bold text-secondary uppercase tracking-tighter opacity-60">{cat.percent}% du total</span>
                    </div>
                  </div>
                  <span className="font-display font-extrabold text-sm group-hover:scale-110 transition-transform tabular-nums">
                    {cat.amount.toLocaleString('fr-FR')} €
                  </span>
                </div>
                <AnimatePresence>
                  {selectedCategory === cat.key && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 pt-1 space-y-0.5">
                        {drillDownTxs.map((t) => (
                          <div key={t.id} className="flex items-center justify-between gap-2 py-2 pl-7 border-t border-surface-container first:border-t-0">
                            <div className="min-w-0">
                              <p className="font-bold text-xs truncate">{t.name}</p>
                              <p className="text-[9px] font-bold text-secondary uppercase">{formatTxDate(t.date)}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {tier === 'pro' ? (
                                // Recategorize + learn a merchant rule (pro only,
                                // enforced server-side by Firestore rules).
                                <select
                                  value={effectiveSlug(t)}
                                  onChange={(e) => recategorizeTransaction(t.id, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[9px] font-bold uppercase bg-surface-container rounded-lg px-1.5 py-1 outline-none max-w-[110px]"
                                  title="Recatégoriser"
                                >
                                  {SYSTEM_CATEGORIES.filter((c) => !c.isIncome).map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                  {customCats.map((c) => (
                                    <option key={c.id} value={c.id!}>{c.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="flex items-center gap-1 text-[8px] font-bold uppercase text-secondary/60" title="Recatégorisation réservée aux membres Pro">
                                  <Lock size={9} /> Pro
                                </span>
                              )}
                              <span className="font-display font-extrabold text-xs text-red-600 tabular-nums">
                                {t.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Custom categories — pro only, capped */}
        {tier === 'pro' && customCats.length < MAX_CUSTOM_CATEGORIES && (
          <div className="mt-3">
            {!showAddCat ? (
              <button
                onClick={() => setShowAddCat(true)}
                className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-primary px-3 py-2 rounded-xl hover:bg-primary/5 transition-colors"
              >
                <Plus size={14} /> Nouvelle catégorie
              </button>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await addCustomCategory(newCat.name, newCat.colorClass, newCat.iconName, Number(newCat.limit) || 0);
                  setNewCat({ name: '', colorClass: CUSTOM_COLOR_OPTIONS[0], iconName: CUSTOM_ICON_OPTIONS[0], limit: '' });
                  setShowAddCat(false);
                }}
                className="bg-surface-container-lowest rounded-2xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex flex-col gap-3"
              >
                <div className="flex gap-2">
                  <input
                    value={newCat.name}
                    onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                    placeholder="Nom (ex: Animaux)"
                    maxLength={50}
                    required
                    className="flex-[2] bg-surface-container p-2.5 text-sm font-bold rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none"
                  />
                  <input
                    value={newCat.limit}
                    onChange={(e) => setNewCat({ ...newCat, limit: e.target.value })}
                    placeholder="Budget €/mois"
                    type="number"
                    min="0"
                    className="flex-1 bg-surface-container p-2.5 text-sm font-bold rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {CUSTOM_COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewCat({ ...newCat, colorClass: c })}
                        className={`w-6 h-6 rounded-full ${c} transition-transform ${newCat.colorClass === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'opacity-60'}`}
                        aria-label={`Couleur ${c}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowAddCat(false)} className="text-[10px] font-extrabold uppercase text-secondary px-3 py-2">
                      Annuler
                    </button>
                    <button type="submit" className="bg-primary text-white text-[10px] font-extrabold uppercase tracking-wider px-4 py-2 rounded-xl active:scale-95 transition-all">
                      Créer
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Insight Tip */}
      <section className="bg-gradient-to-br from-tertiary-fixed to-surface-container-lowest rounded-2xl p-5 flex gap-4 items-start shadow-sm border border-tertiary-fixed/20 overflow-hidden relative">
        <div className="bg-white p-2.5 rounded-xl shadow-sm ring-1 ring-tertiary-fixed/30 z-10">
          <Lightbulb className="text-tertiary" size={24} fill="currentColor" fillOpacity={0.1} />
        </div>
        <div className="flex flex-col gap-1 z-10">
          <h3 className="font-display font-extrabold text-sm text-tertiary">Conseil Spendly</h3>
          <motion.p
            key={user?.insight}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs font-medium text-[#643f00] leading-relaxed"
          >
            {user?.insight || "Continue à enregistrer tes dépenses pour recevoir des conseils personnalisés."}
          </motion.p>
        </div>
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/40 blur-3xl -mr-12 -mt-12 rounded-full" />
      </section>
    </div>
  );
}
