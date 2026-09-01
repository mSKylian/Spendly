import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Utensils, Zap, Car, Play, Coffee, ShoppingCart, ShoppingBag, Music, Cloud, Package, Tv, TrendingUp, Sparkles, Plus, X, Landmark, Calendar, Camera, Home, HeartPulse, Plane, Wallet } from 'lucide-react';
import { SpendlyStore } from '../store';
import ReceiptScanner from './ReceiptScanner';
import { totalSpent, spentByCategory, usedPercent as computeUsedPercent, formatTxDate, toISODate, monthReference, monthlySeries, transactionsForCategory, hexFromColorClass, effectiveSlug } from '../lib/finance';
import { rollupSlug, displayMeta, slugFromLegacy } from '../lib/taxonomy';
import type { Transaction } from '../types';

interface DashboardProps {
  store: SpendlyStore;
}

export default function Dashboard({ store }: DashboardProps) {
  const { balance, categories, transactions, user, accounts, addTransaction, scanReceipt } = store;
  const [showAdd, setShowAdd] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [newTrans, setNewTrans] = useState({ name: '', amount: '', category: 'Nourriture', accountId: accounts[0]?.id || '' });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    // Fall back to the first account when the field was never touched (accounts
    // load asynchronously, so the initial state can be empty on first render).
    const effectiveAccountId = newTrans.accountId || accounts[0]?.id || '';
    await addTransaction({
      name: newTrans.name,
      amount: -Math.abs(Number(newTrans.amount)),
      category: newTrans.category,
      date: toISODate(),
      iconName: categories.find(c => c.name === newTrans.category)?.iconName || 'shopping',
      accountId: effectiveAccountId
    });
    setShowAdd(false);
    setNewTrans({ name: '', amount: '', category: 'Nourriture', accountId: accounts[0]?.id || '' });
  };

  const getIcon = (name: string) => {
    switch (name) {
      case 'utensils': return <Utensils size={20} className="text-orange-600" />;
      case 'zap': return <Zap size={20} className="text-purple-600" />;
      case 'car': return <Car size={20} className="text-blue-600" />;
      case 'play': return <Play size={20} className="text-teal-600" />;
      case 'coffee': return <Coffee size={20} className="text-secondary" />;
      case 'shopping':
      case 'shopping-cart': return <ShoppingCart size={20} className="text-secondary" />;
      case 'shopping-bag': return <ShoppingBag size={20} className="text-secondary" />;
      case 'music': return <Music size={20} className="text-secondary" />;
      case 'cloud': return <Cloud size={20} className="text-secondary" />;
      case 'package': return <Package size={20} className="text-secondary" />;
      case 'tv': return <Tv size={20} className="text-secondary" />;
      case 'home': return <Home size={20} className="text-secondary" />;
      case 'heart': return <HeartPulse size={20} className="text-secondary" />;
      case 'plane': return <Plane size={20} className="text-secondary" />;
      case 'wallet': return <Wallet size={20} className="text-secondary" />;
      default: return <ShoppingCart size={20} className="text-secondary opacity-60" />;
    }
  };

  // Derive spend from transactions (single source of truth). Shows the current
  // month; if it has no transactions (e.g. right after importing a historical
  // statement), falls back to the latest month with data, labeled below.
  const monthRef = useMemo(() => monthReference(transactions), [transactions]);
  // Categories are keyed by taxonomy slug, rolled up to 4 groups + Autre on
  // the free tier; pro sees the full taxonomy (docs/CATEGORY_ENGINE.md).
  const tier = user?.tier ?? 'free';
  const keyOf = useMemo(() => (t: Transaction) => rollupSlug(effectiveSlug(t), tier), [tier]);
  const monthByCategory = useMemo(() => spentByCategory(transactions, 'month', monthRef, keyOf), [transactions, monthRef, keyOf]);
  const monthSpent = useMemo(() => totalSpent(transactions, 'month', monthRef), [transactions, monthRef]);
  const usedPercent = computeUsedPercent(monthSpent, user?.limits?.month ?? 0);
  const now = new Date();
  const isCurrentMonth = monthRef.getMonth() === now.getMonth() && monthRef.getFullYear() === now.getFullYear();
  const monthLabel = monthRef.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  // Top categories by actual spend this month. Display metadata comes from the
  // taxonomy; budgets join from the user's category docs via their legacy name.
  const series = useMemo(() => monthlySeries(transactions, 6, monthRef, keyOf), [transactions, monthRef, keyOf]);
  const topCategories = useMemo(() => {
    const budgetBySlug = new Map(categories.map(c => [slugFromLegacy(c.name), c.limit]));
    return Object.entries(monthByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, spent]) => {
        const meta = displayMeta(key, tier);
        return {
          key,
          name: meta.name,
          spent,
          limit: budgetBySlug.get(key as any) ?? 0,
          colorClass: meta.colorClass,
          color: hexFromColorClass(meta.colorClass),
          iconName: meta.iconName,
          history: series.map(p => p.byCategory[key] || 0),
        };
      });
  }, [monthByCategory, categories, series, tier]);

  const [drillDown, setDrillDown] = useState<string | null>(null);
  const drillDownCat = topCategories.find(c => c.key === drillDown);
  const drillDownTxs = useMemo(
    () => (drillDown ? transactionsForCategory(transactions, drillDown, 'month', monthRef, keyOf) : []),
    [drillDown, transactions, monthRef, keyOf]
  );

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Wallet Banner */}
      <section className="bg-primary rounded-2xl p-6 text-white shadow-xl mt-4 relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1">Bonjour {user?.name}</p>
              <h2 className="font-display text-4xl font-extrabold mb-6 tracking-tight">
                {balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </h2>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowScanner(true)}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 transition-all active:scale-90"
                title="Scanner un ticket"
              >
                <Camera size={20} />
              </button>
              <button 
                onClick={() => setShowAdd(true)}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 transition-all active:scale-90"
                title="Ajouter une dépense"
              >
                <Plus size={24} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider">
              <span className="opacity-70">Budget utilisé</span>
              <span>{usedPercent}%</span>
            </div>
            <div className="w-full h-2 bg-on-primary-container/20 rounded-full overflow-hidden">
              <motion.div 
                key={usedPercent}
                initial={{ width: 0 }}
                animate={{ width: `${usedPercent}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]" 
              />
            </div>
          </div>
        </div>
        {/* Background Decor */}
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-all" />
      </section>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdd(false)}
              className="absolute inset-0 bg-primary/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-2xl relative z-10 border border-white"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-display font-extrabold text-xl">Nouvelle dépense</h3>
                <button onClick={() => setShowAdd(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Marchand</label>
                  <div className="relative">
                    <ShoppingCart className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary opacity-40" size={18} />
                    <input 
                      type="text" 
                      placeholder="Ex: Cora, Starbucks..." 
                      required
                      value={newTrans.name}
                      onChange={e => setNewTrans({...newTrans, name: e.target.value})}
                      className="w-full bg-surface-container-low border border-surface-container p-4 pl-12 rounded-2xl text-sm font-bold placeholder:font-medium focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Montant (€)</label>
                    <input 
                      type="number" 
                      placeholder="0.00" 
                      required
                      step="0.01"
                      value={newTrans.amount}
                      onChange={e => setNewTrans({...newTrans, amount: e.target.value})}
                      className="w-full bg-surface-container-low border border-surface-container p-4 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Catégorie</label>
                    <select 
                      value={newTrans.category}
                      onChange={e => setNewTrans({...newTrans, category: e.target.value})}
                      className="w-full bg-surface-container-low border border-surface-container p-4 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all appearance-none"
                    >
                      {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Compte bancaire</label>
                  <div className="relative">
                    <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary opacity-40" size={18} />
                    <select
                      value={newTrans.accountId || accounts[0]?.id || ''}
                      onChange={e => setNewTrans({...newTrans, accountId: e.target.value})}
                      className="w-full bg-surface-container-low border border-surface-container p-4 pl-12 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all appearance-none"
                    >
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.bankName})</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-primary text-white py-4 rounded-2xl font-extrabold uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 mt-4"
                >
                  Ajouter ma dépense
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowScanner(false)}
              className="absolute inset-0 bg-primary/20 backdrop-blur-sm"
            />
            <div className="relative z-10 w-full max-w-sm">
              <ReceiptScanner 
                onScan={scanReceipt} 
                onSave={addTransaction}
                onClose={() => setShowScanner(false)} 
                accounts={accounts}
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Insight */}
      <section className="bg-gradient-to-br from-surface-container-lowest to-surface-container rounded-2xl p-5 shadow-[0px_8px_30px_rgba(0,0,0,0.04)] flex items-center gap-4 border border-white relative overflow-hidden group">
        {store.isAiAnalyzing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-primary/5 backdrop-blur-[1px] flex items-center justify-center z-10"
          >
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  className="w-1.5 h-1.5 bg-primary rounded-full"
                />
              ))}
            </div>
          </motion.div>
        )}
        
        <div className="w-14 h-14 shrink-0 relative">
          <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl group-hover:bg-primary/20 transition-all" />
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuChUm58n5Az1FQm3TaVWgK-hT8JN4NfHNkePinA3YWfvHk3gCWc40mPZOzaFuWOVAvoe7wbW92tpeN_sZ4pq6fOpNg7nwd86feUvTvmjEb6jOAwa64s7WJ81z2uU-aPjPS7_1434YrwjbVJ0e3rSnYn-I7AmHqqaGF4QQiKhMCmIeRPRSkWPY4Wb5pY-Tc0LN4_G6MrDPUXPiorfkTTKVuzXQEKp7Wop8-FM0KcEy-c_oEmUTTM0G4-YcH_pZVmkT3gYlRpPXGSRaQ" 
            alt="Robot"
            className="w-full h-full object-contain relative z-1"
          />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Sparkles size={12} /> Spend Coach
          </p>
          <p className="text-sm font-medium leading-relaxed text-secondary-on-container">
            {user?.insight || "J'analyse tes dépenses pour booster ton épargne..."}
          </p>
        </div>
        <button 
          onClick={store.executeAiAnalysis}
          disabled={store.isAiAnalyzing}
          className="w-10 h-10 hover:bg-surface-container rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-30"
        >
          <TrendingUp className="text-tertiary" size={20} />
        </button>
      </section>

      {/* Categories Bento Grid */}
      <section>
        <div className="flex items-baseline gap-2 mb-4">
          <h3 className="font-display font-extrabold text-lg">Catégories</h3>
          {!isCurrentMonth && (
            <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">{monthLabel}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {topCategories.length === 0 && (
            <p className="col-span-2 text-sm font-medium text-secondary text-center py-6">
              Aucune dépense ce mois-ci.
            </p>
          )}
          {topCategories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setDrillDown(cat.key)}
              className="bg-surface-container-lowest p-5 rounded-2xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] text-left transition-all active:scale-[0.98] hover:shadow-md"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-opacity-10 ${cat.colorClass.replace('bg-', 'bg-opacity-10 bg-')}`}>
                  {getIcon(cat.iconName)}
                </div>
                <Sparkline values={cat.history} color={cat.color} />
              </div>
              <p className="text-[10px] uppercase font-bold text-secondary mb-0.5 tracking-wider">{cat.name}</p>
              <p className="font-display font-extrabold text-lg tabular-nums">{cat.spent.toLocaleString('fr-FR')}€</p>
              <div className="w-full h-1.5 bg-surface-container rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full ${cat.colorClass}`}
                  style={{ width: `${cat.limit > 0 ? Math.min(100, (cat.spent / cat.limit) * 100) : 0}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Category Drill-down Sheet */}
      <AnimatePresence>
        {drillDownCat && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={() => setDrillDown(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="bg-surface-container-lowest w-full max-w-lg rounded-t-3xl p-6 max-h-[75vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-opacity-10 ${drillDownCat.colorClass.replace('bg-', 'bg-opacity-10 bg-')}`}>
                    {getIcon(drillDownCat.iconName)}
                  </div>
                  <div>
                    <h3 className="font-display font-extrabold text-lg leading-tight">{drillDownCat.name}</h3>
                    <p className="text-[10px] uppercase font-bold text-secondary tracking-wider">{monthLabel}</p>
                  </div>
                </div>
                <button onClick={() => setDrillDown(null)} className="p-2 rounded-full hover:bg-surface-container">
                  <X size={18} />
                </button>
              </div>
              <p className="font-display font-extrabold text-2xl mb-4 tabular-nums">
                {drillDownCat.spent.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </p>
              <div className="space-y-1">
                {drillDownTxs.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-surface-container last:border-none">
                    <div>
                      <p className="font-bold text-sm">{t.name}</p>
                      <p className="text-[10px] font-bold text-secondary uppercase">{formatTxDate(t.date)}</p>
                    </div>
                    <span className="font-display font-extrabold text-sm text-red-600 tabular-nums">
                      {t.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Transactions */}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-extrabold text-lg">Transactions récentes</h3>
          <button className="text-primary text-xs font-bold uppercase tracking-wider">Tout voir</button>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] divide-y divide-surface-container">
          {transactions.map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                  {getIcon(t.iconName)}
                </div>
                <div>
                  <p className="font-bold text-sm">{t.name}</p>
                  <p className="text-[10px] font-medium text-secondary uppercase tracking-tight">{formatTxDate(t.date)}</p>
                </div>
              </div>
              <p className={`font-display font-extrabold ${t.amount < 0 ? 'text-error' : 'text-primary'}`}>
                {t.amount < 0 ? '-' : '+'} {Math.abs(t.amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// 6-month spend sparkline: emphasized endpoint, no axes — trend at a glance.
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 56, h = 24, pad = 3;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => ({
    x: pad + i * step,
    y: h - pad - ((h - pad * 2) * v) / max,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg width={w} height={h} aria-hidden="true" className="opacity-90">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last.x} cy={last.y} r="3" fill={color} />}
    </svg>
  );
}
