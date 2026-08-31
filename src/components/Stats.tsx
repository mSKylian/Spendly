import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Lightbulb } from 'lucide-react';
import { SpendlyStore } from '../store';
import {
  Period,
  totalSpent,
  spentByCategory,
  usedPercent as computeUsedPercent,
  hexFromColorClass,
} from '../lib/finance';

interface StatsProps {
  store: SpendlyStore;
}

type PeriodLabel = 'Semaine' | 'Mois' | 'Année';

const PERIOD_MAP: Record<PeriodLabel, Period> = {
  'Semaine': 'week',
  'Mois': 'month',
  'Année': 'year',
};

export default function Stats({ store }: StatsProps) {
  const { transactions, categories, user } = store;
  const [periodLabel, setPeriodLabel] = useState<PeriodLabel>('Mois');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const period = PERIOD_MAP[periodLabel];

  const data = useMemo(() => {
    const spent = totalSpent(transactions, period);
    const limit = user?.limits?.[period] ?? 0;
    const byCat = spentByCategory(transactions, period);

    const cats = categories
      .map((c) => {
        const amount = byCat[c.name.toLowerCase()] || 0;
        return {
          name: c.name,
          amount,
          color: hexFromColorClass(c.colorClass),
        };
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
  }, [transactions, categories, user, period]);

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Period Selector */}
      <div className="flex bg-surface-container p-1.5 rounded-2xl self-center w-full max-w-sm mt-4 shadow-sm border border-white">
        {(['Semaine', 'Mois', 'Année'] as PeriodLabel[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodLabel(p)}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200
              ${periodLabel === p ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-surface-container-high'}`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Global Budget Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex flex-col items-center gap-6">
        <div className="w-full flex justify-between items-start">
          <h2 className="font-display font-extrabold text-base">Budget Global</h2>
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
        <h2 className="font-display font-extrabold text-lg mb-4">Répartition par catégorie</h2>
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] space-y-2">
          {data.categories.length === 0 && (
            <p className="text-sm font-medium text-secondary text-center py-6">
              Aucune dépense sur cette période.
            </p>
          )}
          <AnimatePresence mode="popLayout">
            {data.categories.map((cat) => (
              <motion.div
                key={cat.name}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                className={`flex items-center justify-between p-3 rounded-xl transition-all group cursor-pointer ${
                  selectedCategory === cat.name ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-surface-container-low'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: cat.color }} />
                  <div className="flex flex-col">
                    <span className="font-bold text-sm tracking-tight">{cat.name}</span>
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-tighter opacity-60">{cat.percent}% du total</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-display font-extrabold text-sm group-hover:scale-110 transition-transform">
                    {cat.amount.toLocaleString('fr-FR')} €
                  </span>
                  {selectedCategory === cat.name && (
                    <motion.span
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-[9px] font-bold text-primary uppercase mt-1"
                    >
                      Détails actifs
                    </motion.span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
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
