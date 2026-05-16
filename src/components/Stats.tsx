import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Lightbulb } from 'lucide-react';

type Period = 'Semaine' | 'Mois' | 'Année';

export default function Stats() {
  const [period, setPeriod] = useState<Period>('Mois');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const dataByPeriod: Record<Period, any> = {
    'Semaine': {
      used: 55,
      remaining: 225,
      spent: 275,
      categories: [
        { name: 'Nourriture', percent: 45, amount: 123.75, color: '#005440' },
        { name: 'Loisirs', percent: 20, amount: 55, color: '#ffb957' },
        { name: 'Transport', percent: 25, amount: 68.75, color: '#57605f' },
        { name: 'Abos', percent: 10, amount: 27.5, color: '#bec9c3' },
      ],
      insight: 'Vous avez dépensé 10% de moins en Loisirs cette semaine. Bel effort !'
    },
    'Mois': {
      used: 70,
      remaining: 750,
      spent: 1750,
      categories: [
        { name: 'Nourriture', percent: 40, amount: 700, color: '#005440' },
        { name: 'Loisirs', percent: 25, amount: 437.50, color: '#ffb957' },
        { name: 'Transport', percent: 20, amount: 350, color: '#57605f' },
        { name: 'Abos', percent: 15, amount: 262.50, color: '#bec9c3' },
      ],
      insight: 'Vous avez dépensé 15% de moins en Transport ce mois-ci. Pourquoi ne pas placer ces 52 € sur votre livret d’épargne ?'
    },
    'Année': {
      used: 65,
      remaining: 8400,
      spent: 15600,
      categories: [
        { name: 'Nourriture', percent: 35, amount: 5460, color: '#005440' },
        { name: 'Loisirs', percent: 30, amount: 4680, color: '#ffb957' },
        { name: 'Transport', percent: 15, amount: 2340, color: '#57605f' },
        { name: 'Abos', percent: 20, amount: 3120, color: '#bec9c3' },
      ],
      insight: "Sur l'année, vos abonnements représentent un poste important. Avez-vous pensé à regrouper vos comptes ?"
    }
  };

  const currentData = dataByPeriod[period];

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Period Selector */}
      <div className="flex bg-surface-container p-1.5 rounded-2xl self-center w-full max-w-sm mt-4 shadow-sm border border-white">
        {(['Semaine', 'Mois', 'Année'] as Period[]).map((p) => (
          <button 
            key={p} 
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200
              ${period === p ? 'bg-primary text-white shadow-md' : 'text-secondary hover:bg-surface-container-high'}`}
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
               key={period}
               initial={{ strokeDashoffset: 282 }}
               animate={{ strokeDashoffset: 282.7 - (282.7 * currentData.used) / 100 }}
               transition={{ duration: 1, ease: 'easeOut' }}
               cx="50%" cy="50%" r="42%" fill="transparent" stroke="#005440" strokeWidth="12" 
               strokeDasharray="282.7" strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span 
              key={period}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="font-display text-4xl font-extrabold text-primary"
            >
              {currentData.used}%
            </motion.span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary -mt-1 opacity-60">Utilisé</span>
          </div>
        </div>

        <div className="grid grid-cols-2 w-full gap-8 border-t border-surface-container pt-6">
          <motion.div 
            key={`${period}-remaining`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-1"
          >
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary">Budget Restant</span>
            <span className="font-display text-xl font-extrabold text-primary tracking-tight">
              {currentData.remaining.toLocaleString('fr-FR')} €
            </span>
          </motion.div>
          <motion.div 
            key={`${period}-total`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-1 text-right"
          >
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-secondary">Total Dépensé</span>
            <span className="font-display text-xl font-extrabold text-secondary tracking-tight">
              {currentData.spent.toLocaleString('fr-FR')} €
            </span>
          </motion.div>
        </div>
      </section>

      {/* Breakdown List */}
      <section>
        <h2 className="font-display font-extrabold text-lg mb-4">Répartition par catégorie</h2>
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] space-y-2">
          <AnimatePresence mode="popLayout">
            {currentData.categories.map((cat: any) => (
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
            key={period}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs font-medium text-[#643f00] leading-relaxed"
          >
            {currentData.insight}
          </motion.p>
        </div>
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/40 blur-3xl -mr-12 -mt-12 rounded-full" />
      </section>
    </div>
  );
}
