import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Mail, Calendar, TrendingDown, Save, CheckCircle, LogOut, ShieldCheck } from 'lucide-react';
import { SpendlyStore } from '../store';
import AdminPanel from './AdminPanel';

interface ProfileProps {
  store: SpendlyStore;
}

export default function Profile({ store }: ProfileProps) {
  const { user, updateUser, logout } = store;
  if (!user) return null;

  const [formData, setFormData] = useState({
    name: user.name,
    weekLimit: user.limits.week,
    monthLimit: user.limits.month,
    yearLimit: user.limits.year
  });
  const [showSaved, setShowSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser({
      name: formData.name,
      limits: {
        week: Number(formData.weekLimit),
        month: Number(formData.monthLimit),
        year: Number(formData.yearLimit)
      }
    });
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 3000);
  };

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Profile Header */}
      <section className="mt-4">
        <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-white flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-primary/10 border-4 border-white shadow-md overflow-hidden">
               <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="absolute bottom-0 right-0 bg-tertiary text-white p-1.5 rounded-full border-2 border-white">
              <ShieldCheck size={14} />
            </div>
          </div>
          <div className="text-center">
            <h2 className="font-display text-2xl font-extrabold">{user.name}</h2>
            <p className="text-xs font-bold text-secondary uppercase tracking-widest opacity-60">Membre Spendly Premium</p>
          </div>
        </div>
      </section>

      {/* Edit Form */}
      <section>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-white space-y-5">
            <h3 className="font-display font-extrabold text-sm uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
               <User size={16} /> Informations Personnelles
            </h3>
            
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-secondary ml-1">Nom d'affichage</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-surface-container border-none rounded-xl py-3.5 pl-11 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Ton nom"
                />
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/40" />
              </div>
            </div>

            <div className="space-y-2 opacity-60 cursor-not-allowed">
              <label className="text-[10px] uppercase font-bold text-secondary ml-1">Email (Non modifiable)</label>
              <div className="relative">
                <input 
                  type="email" 
                  value={user.email}
                  disabled
                  className="w-full bg-surface-container border-none rounded-xl py-3.5 pl-11 text-sm font-bold cursor-not-allowed"
                />
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/40" />
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-white space-y-5">
            <h3 className="font-display font-extrabold text-sm uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
               <TrendingDown size={16} /> Mes Plafonds de Dépenses
            </h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-secondary ml-1">Par Semaine (€)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={formData.weekLimit}
                    onChange={(e) => setFormData({ ...formData, weekLimit: Number(e.target.value) })}
                    className="w-full bg-surface-container border-none rounded-xl py-3.5 pl-11 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                  <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/40" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-secondary ml-1">Par Mois (€)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={formData.monthLimit}
                    onChange={(e) => setFormData({ ...formData, monthLimit: Number(e.target.value) })}
                    className="w-full bg-surface-container border-none rounded-xl py-3.5 pl-11 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                  <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/40" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-secondary ml-1">Par An (€)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={formData.yearLimit}
                    onChange={(e) => setFormData({ ...formData, yearLimit: Number(e.target.value) })}
                    className="w-full bg-surface-container border-none rounded-xl py-3.5 pl-11 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                  />
                  <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/40" />
                </div>
              </div>
            </div>
          </div>

          <motion.button 
            type="submit"
            whileTap={{ scale: 0.98 }}
            className="w-full bg-primary text-white py-4 rounded-2xl font-extrabold uppercase tracking-widest shadow-lg shadow-primary/20 flex items-center justify-center gap-3 transition-all hover:bg-primary/90"
          >
            <Save size={18} /> Enregistrer les modifications
          </motion.button>
        </form>
      </section>

      {/* Danger Zone */}
      <section className="bg-error/5 rounded-2xl p-6 border border-error/10 mt-8">
        <h3 className="font-display font-extrabold text-sm uppercase tracking-widest text-error mb-4">Zone de danger</h3>
        <button 
          onClick={logout}
          className="flex items-center gap-3 text-error font-bold text-sm hover:underline active:scale-95 transition-all"
        >
          <LogOut size={18} /> Déconnecter mon compte
        </button>
      </section>

      {/* Admin Panel */}
      <AdminPanel />

      {/* Saved Toast */}
      <AnimatePresence>
        {showSaved && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-24 left-4 right-4 bg-tertiary text-white p-4 rounded-2xl shadow-xl flex items-center gap-3 z-50 border border-white/20"
          >
            <div className="bg-white/20 p-2 rounded-xl">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="font-bold text-sm">Profil mis à jour !</p>
              <p className="text-[10px] uppercase font-bold opacity-80">Tes plafonds sont désormais actifs.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
