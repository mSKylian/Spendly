import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, ShoppingCart, Tv, Zap, Car, Utensils, Wifi, HeartPulse, Plane, Home, ChevronRight, Rocket, Lock, CheckCircle, Sparkles, Wallet } from 'lucide-react';
import { SpendlyStore } from '../store';
import { categoryById } from '../lib/taxonomy';
import { verifyChallengeSaving } from '../lib/finance';
import type { Challenge } from '../types';

interface ChallengesProps {
  store: SpendlyStore;
}

/** Display label for a challenge's category: taxonomy name when categoryId is set. */
function challengeCategoryLabel(c: Challenge): string {
  return (c.categoryId && categoryById(c.categoryId)?.name) || c.category;
}

// Icon for a challenge category — matched loosely on the (LLM-provided) name,
// with a generic fallback so no category renders without an icon.
function categoryIcon(category: string, size = 24) {
  const key = category.toLowerCase();
  if (key.includes('course') || key.includes('aliment') || key.includes('nourriture')) return <ShoppingCart size={size} />;
  if (key.includes('abo') || key.includes('streaming')) return <Tv size={size} />;
  if (key.includes('énergie') || key.includes('energie') || key.includes('électric')) return <Zap size={size} />;
  if (key.includes('télécom') || key.includes('telecom') || key.includes('internet') || key.includes('mobile')) return <Wifi size={size} />;
  if (key.includes('transport') || key.includes('auto') || key.includes('carburant')) return <Car size={size} />;
  if (key.includes('restau') || key.includes('loisir')) return <Utensils size={size} />;
  if (key.includes('santé') || key.includes('sante')) return <HeartPulse size={size} />;
  if (key.includes('voyage')) return <Plane size={size} />;
  if (key.includes('logement') || key.includes('loyer')) return <Home size={size} />;
  return <Sparkles size={size} />;
}

export default function Challenges({ store }: ChallengesProps) {
  const { user, challenges, transactions, activateChallenge, executeAiAnalysis, isAiAnalyzing } = store;
  const [filter, setFilter] = useState<string>('Tous');

  // Data-verified savings: compare the category's real monthly spend before vs
  // after completion (lib/finance.verifyChallengeSaving). Null = pending.
  const verifications = useMemo(() => {
    const out = new Map<string, ReturnType<typeof verifyChallengeSaving>>();
    for (const c of challenges) {
      if (c.status === 'completed' && c.categoryId && c.completedAt) {
        out.set(c.id, verifyChallengeSaving(transactions, c.categoryId, c.completedAt));
      }
    }
    return out;
  }, [challenges, transactions]);

  const completedFooter = (c: Challenge): string => {
    const v = verifications.get(c.id);
    if (v == null) return `Gain estimé : ${c.potentialSaving * 12}€ / an · vérification au prochain mois complet`;
    if (v.monthlyDelta > 0) return `Vérifié : ${v.monthlyDelta.toLocaleString('fr-FR')}€ / mois réellement économisés`;
    return `Suivi : pas encore d'économie mesurée sur cette catégorie`;
  };

  const activeChallengesCount = challenges.filter(c => c.status === 'in_progress').length;
  const potentialSavingsTotal = challenges.reduce((acc, c) => acc + (c.status !== 'completed' ? c.potentialSaving : 0), 0);
  const currentSavingsPercent = Math.round((challenges.filter(c => c.status === 'completed').length / (challenges.length || 1)) * 100);

  // Filter pills derive from the categories actually present in the user's
  // challenges (the LLM writes free-form names for now), not a hardcoded list.
  const filters = useMemo(() => {
    const cats = [...new Set(challenges.map(challengeCategoryLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const base = ['Tous'];
    if (challenges.some(c => c.isAiGenerated)) base.push('IA');
    return [...base, ...cats];
  }, [challenges]);

  const filteredChallenges = challenges.filter(c => {
    if (filter === 'Tous') return true;
    if (filter === 'IA') return c.isAiGenerated;
    return challengeCategoryLabel(c) === filter;
  });

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Jackpot Banner */}
      <section className="mt-4">
        <div className="bg-gradient-to-br from-primary-container to-primary text-white p-6 rounded-2xl shadow-xl relative overflow-hidden transition-transform active:scale-[0.99]">
          <div className="flex items-center justify-between relative z-10 mb-6">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1">Cagnotte à débloquer</p>
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-white">{potentialSavingsTotal.toLocaleString('fr-FR')} € <span className="text-lg font-normal opacity-70">/mois</span></h2>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 w-32 bg-white/20 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${currentSavingsPercent}%` }}
                    transition={{ duration: 1.2 }}
                    className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" 
                  />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-tight opacity-90">{activeChallengesCount} économies actives</span>
              </div>
            </div>
            <button 
              onClick={executeAiAnalysis}
              disabled={isAiAnalyzing}
              className={`bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/20 transition-all active:scale-95 group
                ${isAiAnalyzing ? 'opacity-50' : 'hover:bg-white/30'}`}
            >
              {isAiAnalyzing ? (
                 <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles size={32} className="text-white fill-white/20 group-hover:scale-110 transition-transform" />
              )}
            </button>
          </div>
          {/* Decorative element */}
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
          {isAiAnalyzing && (
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-white/5 skew-x-12 translate-x-1/2 pointer-events-none"
            />
          )}
        </div>
      </section>

      {/* Filter Pills */}
      <nav className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-5 px-5">
        {filters.map((f) => (
          <button 
            key={f} 
            onClick={() => setFilter(f)}
            className={`px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap shadow-sm
              ${filter === f ? 'bg-primary text-white' : 'bg-surface-container-high text-secondary hover:bg-surface-container-highest'}`}
          >
            {f === 'IA' ? <span className="flex items-center gap-1"><Sparkles size={10} /> IA</span> : f}
          </button>
        ))}
      </nav>

      {/* Economies List */}
      <div className="space-y-6">
        {filteredChallenges.map((challenge) => (
          <div 
            key={challenge.id} 
            className={`bg-surface-container-lowest rounded-2xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col border relative group transition-all
              ${challenge.status === 'completed' ? 'opacity-70 border-tertiary-fixed' : 'border-white/50'}`}
          >
            <div className="p-5 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${challenge.status === 'completed' ? 'bg-tertiary/10 text-tertiary' : 'bg-primary/5 text-primary'}`}>
                      {categoryIcon(challengeCategoryLabel(challenge))}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 text-[9px] px-1.5 py-0.5 rounded-full border-2 border-white font-bold
                      ${challenge.status === 'completed' ? 'bg-tertiary text-white' : 'bg-surface-container text-secondary'}`}>
                      LVL {challenge.level}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h3 className="font-display font-extrabold text-sm leading-tight">{challenge.title}</h3>
                      {challenge.isAiGenerated && (
                        <div className="bg-primary/10 text-primary p-0.5 rounded-md flex items-center gap-1 px-1.5" title="Détecté par Spend Coach">
                          <Sparkles size={10} className="fill-primary/20" />
                          <span className="text-[8px] font-black uppercase">Coach</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-secondary">{challenge.subtitle}</p>
                    {challenge.targetBankName && (
                      <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-tertiary uppercase tracking-wider backdrop-blur-sm bg-tertiary/5 w-fit px-2 py-0.5 rounded-full border border-tertiary/10">
                        <Wallet size={10} />
                        <span>Compte : {challenge.targetBankName}</span>
                      </div>
                    )}
                  </div>
                </div>
                {(challenge.progress !== undefined || challenge.status === 'completed') && (
                   <div className="relative w-10 h-10 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="20" cy="20" r="16" fill="transparent" stroke="#eeeeee" strokeWidth="3" />
                      <circle 
                        cx="20" cy="20" r="16" fill="transparent" stroke={challenge.status === 'completed' ? '#00796b' : '#005440'} strokeWidth="3" 
                        strokeDasharray="100.5" strokeDashoffset={100.5 - (challenge.status === 'completed' ? 100 : (challenge.progress || 0))} 
                      />
                    </svg>
                    <span className={`absolute text-[9px] font-bold ${challenge.status === 'completed' ? 'text-tertiary' : 'text-primary'}`}>
                      {challenge.status === 'completed' ? '100' : challenge.progress}%
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs font-medium text-secondary leading-normal mb-6">
                {challenge.description}
              </p>
              <div className="flex gap-3">
                <button 
                  disabled={challenge.status === 'completed'}
                  onClick={() => activateChallenge(challenge.id)}
                  className={`flex-[2] py-3.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2
                    ${challenge.status === 'completed' ? 'bg-tertiary text-white cursor-default shadow-none' : 'bg-primary text-white shadow-primary/20'}`}
                >
                  {challenge.status === 'available' && <Rocket size={14} />}
                  {challenge.status === 'in_progress' && <Lock size={14} />}
                  {challenge.status === 'completed' && <CheckCircle size={14} />}
                  
                  {challenge.status === 'available' && `J'économise ${challenge.potentialSaving}€`}
                  {challenge.status === 'in_progress' && `Débloquer ${challenge.potentialSaving}€`}
                  {challenge.status === 'completed' && 'Cagnotte Validée'}
                </button>
                <button className="flex-1 bg-surface-container text-secondary py-3.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest active:scale-95 transition-all">
                  {challenge.category === 'Énergie' ? 'Comparer' : 'Détails'}
                </button>
              </div>
            </div>
            
            <div className={`px-5 py-2.5 border-t flex items-center justify-between
              ${challenge.status === 'completed' ? 'bg-tertiary/10 border-tertiary/20 text-tertiary' : 'bg-primary/5 border-primary/10 text-primary'}`}>
              <div className="flex items-center gap-2">
                {challenge.status === 'completed' ? <Trophy size={14} /> : <Sparkles size={14} />}
                <span className="text-[10px] font-extrabold uppercase tracking-widest">
                  {challenge.status === 'completed'
                    ? completedFooter(challenge)
                    : `Potentiel : ${challenge.potentialSaving * 12}€ / an`}
                </span>
              </div>
              {challenge.status !== 'completed' && <ChevronRight size={14} className="opacity-40" />}
            </div>
          </div>
        ))}
      </div>

      {/* Spend Coach Tip */}
      <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 flex gap-4 items-center">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-primary-fixed-dim shrink-0 ring-2 ring-white">
          <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBUbyCz2YNYFVSgwHWJrujZUeBGGnyrGKVItBaBG75eJRtc4R-EoDfhtTvO6m1pZ0_DsRHzP5owJ1QpwinmKRKycWnMkzoK_KHHftzx-l1Ds1qu6IlH7q5QFohqpnayWy3AEpRo-hqnJ8Zo8sK4wuPlT4W1smSVquJUaYyQE0TADZLoE_D35MEKsopei3bfxfXDT1EznaJVy1W4dKrSDxiAcMcleK9A9xIr_J9qaqRVhkrRYkOaTx1npTKgR9soWL1U9HUjEfdeHfs" alt="Coach" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-primary mb-0.5">Spend Coach dit :</p>
          <p className="text-[13px] font-medium italic leading-snug">
            "{user?.insight || (isAiAnalyzing ? "J'analyse tes dépenses..." : "Chaque petit euro économisé aujourd'hui est une graine pour ta liberté financière. Continue !")}"
          </p>
        </div>
      </div>

       {/* Footer Decor */}
       <div className="relative w-full h-40 rounded-2xl overflow-hidden mt-4">
        <img 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCbz9chpCvBf09KaQMu4fHnZAs_Fl4tUXg8HNTLYCCFt_JvctfmzZ_RomQJKvAnldDJIO2_XTxCiaC_ZqXTmcmOj4DEgJVWyJJw8uaEyXFco1LUVzgZhIsAfIm8pk7ts3W8AoFNVDUhGfgwr8BDej-iwAHzM7TNRUmWpt61ikYHBuo01c_HZqK3RCgaDuhRQINf2FK43Pl9uETrYmladOE_tJkHjK--Z1dKIN_MxnNfwVy4yz2qkf4lICIyocOQjg9An23BFLfLVIQ" 
          alt="Decor"
          className="w-full h-full object-cover grayscale opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent flex items-end p-5">
          <p className="text-white font-display font-extrabold text-sm">Bientôt de nouvelles économies...</p>
        </div>
      </div>
    </div>
  );
}
