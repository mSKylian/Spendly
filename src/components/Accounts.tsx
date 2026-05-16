import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Landmark, Wallet, CreditCard, Bitcoin, Plus, ChevronRight, Info, AlertCircle, X, ShieldCheck, ExternalLink, Sparkles, Check, Trash2 } from 'lucide-react';
import { SpendlyStore } from '../store';

interface AccountsProps {
  store: SpendlyStore;
}

export default function Accounts({ store }: AccountsProps) {
  const { accounts, totalAssets, addAccount, deleteAccount, addTransaction, user, upgradeToPro } = store;
  const [showConnect, setShowConnect] = useState(false);
  const [step, setStep] = useState<'selection' | 'connecting' | 'success' | 'upgrade'>('selection');
  const [selectedType, setSelectedType] = useState<'current' | 'paypal' | 'livret_a' | 'crypto' | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  const accountTypes = [
    { id: 'current', name: 'Compte Courant', bank: 'Toutes banques', icon: 'bank', color: 'bg-blue-500', isPro: false },
    { id: 'paypal', name: 'PayPal', bank: 'PayPal Inc.', icon: 'wallet', color: 'bg-indigo-600', isPro: false },
    { id: 'livret_a', name: 'Livret A', bank: 'Épargne sécurisée', icon: 'card', color: 'bg-orange-500', isPro: true },
    { id: 'crypto', name: 'Crypto Wallet', bank: 'Ethereum / Bitcoin', icon: 'bitcoin', color: 'bg-yellow-500', isPro: true },
  ] as const;

  const handleConnect = async (type: typeof accountTypes[number]) => {
    if (type.isPro && user?.tier !== 'pro') {
      setStep('upgrade');
      return;
    }
    
    setSelectedType(type.id);
    setStep('connecting');
    
    if (type.id === 'paypal') {
      const authWindow = window.open('https://www.paypal.com/signin', 'paypal_login', 'width=400,height=600');
      
      if (!authWindow) {
        alert("Veuillez autoriser les popups pour lier votre compte PayPal.");
        setStep('selection');
        return;
      }
      
      const checkClosed = setInterval(async () => {
        if (authWindow.closed) {
          clearInterval(checkClosed);
          const accountId = await addAccount({
            name: type.name,
            bankName: type.bank,
            balance: 245.50, // mock paypal balance
            type: type.id,
            iconName: type.icon,
            colorClass: type.color
          });

          // Sync some transactions
          if (accountId && typeof accountId === 'string') {
            await Promise.all([
              addTransaction({
                name: 'Netflix',
                amount: -13.99,
                category: 'Abonnements',
                date: new Date().toISOString().split('T')[0],
                iconName: 'tv',
                accountId: accountId
              }),
              addTransaction({
                name: 'Virement Jean',
                amount: 45.00,
                category: 'Revenus',
                date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
                iconName: 'zap',
                accountId: accountId
              }),
              addTransaction({
                name: 'Spotify',
                amount: -10.99,
                category: 'Abonnements',
                date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
                iconName: 'play',
                accountId: accountId
              })
            ]);
          }

          setStep('success');
          setTimeout(() => {
            setShowConnect(false);
            setStep('selection');
          }, 2000);
        }
      }, 500);
      return;
    }

    // Simulate secure connection for other types
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    await addAccount({
      name: type.name,
      bankName: type.bank,
      balance: type.id === 'crypto' ? 0.25 : 500, // mock initial balance
      type: type.id,
      iconName: type.icon,
      colorClass: type.color
    });
    
    setStep('success');
    setTimeout(() => {
      setShowConnect(false);
      setStep('selection');
    }, 2000);
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    await upgradeToPro();
    setIsUpgrading(false);
    setStep('selection');
  };

  const getIcon = (name: string, color: string) => {
    const iconProps = { size: 24, className: "text-white" };
    switch (name) {
      case 'bank': return <div className={`p-2.5 rounded-xl ${color}`}><Landmark {...iconProps} /></div>;
      case 'wallet': return <div className={`p-2.5 rounded-xl ${color}`}><Wallet {...iconProps} /></div>;
      case 'bitcoin': return <div className={`p-2.5 rounded-xl ${color}`}><Bitcoin {...iconProps} /></div>;
      case 'card': return <div className={`p-2.5 rounded-xl ${color}`}><CreditCard {...iconProps} /></div>;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Total Assets Card */}
      <section className="mt-4">
        <div className="bg-gradient-to-br from-primary-container to-primary text-white p-6 rounded-2xl shadow-xl relative overflow-hidden transition-transform active:scale-[0.99]">
          <div className="flex flex-col relative z-10">
            <p className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1">Patrimoine total</p>
            <h2 className="font-display text-4xl font-extrabold tracking-tight mb-6">
              {totalAssets.toLocaleString('fr-FR')} €
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-primary bg-white/20 backdrop-blur-sm" />
                 ))}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tight opacity-90">{accounts.length} sources connectées</span>
            </div>
          </div>
          <motion.div 
            initial={{ opacity: 0, rotate: -20, scale: 0.5 }}
            animate={{ opacity: 0.15, rotate: 0, scale: 1 }}
            className="absolute -right-4 -bottom-4 text-white"
          >
            <Landmark size={140} />
          </motion.div>
        </div>
      </section>

      {/* Accounts List */}
      <section>
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-display font-extrabold text-lg">Mes Comptes</h3>
          <button 
            onClick={() => setShowConnect(true)}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 hover:scale-110 active:scale-95 transition-all"
          >
            <Plus size={20} />
          </button>
        </div>
        
        <div className="flex flex-col gap-4">
          {accounts.map((account) => (
            <motion.div 
              key={account.id} 
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="bg-surface-container-lowest rounded-2xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex items-center justify-between border border-white group hover:border-primary/20 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-4">
                {getIcon(account.iconName, account.colorClass)}
                <div>
                  <h4 className="font-bold text-sm leading-tight text-on-surface">{account.name}</h4>
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-tight opacity-60">{account.bankName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-display font-extrabold text-base tracking-tight text-right">
                  {account.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                </p>
                <div className="flex items-center gap-1 ml-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setAccountToDelete(account.id);
                    }}
                    className="p-1.5 text-secondary opacity-40 hover:text-red-500 hover:opacity-100 hover:bg-red-50 rounded-full transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight size={16} className="text-secondary opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Account Safety Tip */}
      <section className="bg-gradient-to-br from-primary-container/5 to-surface-container-lowest rounded-2xl p-5 flex gap-4 items-start shadow-sm border border-primary/10">
        <div className="bg-primary/10 p-2.5 rounded-xl shadow-sm">
          <AlertCircle className="text-primary" size={24} />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="font-display font-extrabold text-sm text-primary">Alerte Diversification</h3>
          <p className="text-xs font-medium text-on-surface-variant leading-relaxed">
            Vous avez plus de <span className="font-bold text-primary">80%</span> de vos actifs sur votre compte courant. Pensez à verser le surplus sur votre <span className="font-bold">Livret A</span> pour générer des intérêts.
          </p>
        </div>
      </section>

      {/* Connection Info */}
      <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 flex items-center justify-center gap-2 border border-surface-container">
        <Info size={14} className="text-secondary" />
        <p className="text-[10px] font-bold text-secondary uppercase tracking-widest text-center">
          Tous vos comptes sont synchronisés via Spendly Secure Link
        </p>
      </div>

      {/* Connect Account Modal */}
      <AnimatePresence>
        {showConnect && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConnect(false)}
              className="absolute inset-0 bg-primary/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-2xl relative z-10 border border-white overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-display font-extrabold text-xl">Lier un compte</h3>
                <button onClick={() => setShowConnect(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              {step === 'selection' && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-4 opacity-70">Choisissez votre service</p>
                  {accountTypes.map((type) => {
                    const isLocked = type.isPro && user?.tier !== 'pro';
                    return (
                      <button 
                        key={type.id}
                        onClick={() => handleConnect(type)}
                        className="w-full p-4 rounded-2xl flex items-center justify-between border transition-all relative group overflow-hidden bg-surface-container-low border-surface-container hover:border-primary/30 hover:bg-surface-container active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-4">
                          {getIcon(type.icon, type.color)}
                          <div className="text-left">
                            <p className="font-bold text-sm leading-tight">{type.name}</p>
                            <p className="text-[10px] font-bold text-secondary uppercase tracking-tight">{type.bank}</p>
                          </div>
                        </div>
                        {isLocked ? (
                          <div className="flex items-center gap-1.5 bg-tertiary/10 text-tertiary px-2 py-1 rounded-full border border-tertiary/20">
                            <Sparkles size={10} className="fill-tertiary/20" />
                            <span className="text-[9px] font-black uppercase text-tertiary">PRO</span>
                          </div>
                        ) : (
                          <ChevronRight size={16} className="text-secondary opacity-40 group-hover:opacity-100 transition-opacity" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 'connecting' && (
                <div className="py-12 flex flex-col items-center gap-6 text-center">
                  <div className="relative">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                      className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ShieldCheck className="text-primary animate-pulse" size={32} />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-1">
                      {selectedType === 'paypal' ? "Connexion PayPal..." : "Connexion sécurisée..."}
                    </h4>
                    <p className="text-xs text-secondary font-medium px-8">
                      {selectedType === 'paypal' 
                        ? "Veuillez terminer la connexion dans la fenêtre PayPal qui vient de s'ouvrir. Cette fenêtre se mettra à jour automatiquement."
                        : "Nous établissons un lien chiffré avec Spendly Secure Link."}
                    </p>
                  </div>
                </div>
              )}

              {step === 'success' && (
                <div className="py-12 flex flex-col items-center gap-6 text-center">
                   <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-green-500/20"
                  >
                    <Check size={40} strokeWidth={3} />
                  </motion.div>
                  <div>
                    <h4 className="font-bold text-lg mb-1">Compte synchronisé !</h4>
                    <p className="text-xs text-secondary font-medium">Vos transactions importent automatiquement.</p>
                  </div>
                </div>
              )}

              {step === 'upgrade' && (
                <div className="py-4 flex flex-col gap-6">
                  <div className="bg-tertiary/10 p-6 rounded-2xl border border-tertiary/20 text-center relative overflow-hidden">
                    <Sparkles size={48} className="text-tertiary fill-tertiary/20 absolute -right-4 -top-4 rotate-12 opacity-30" />
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck size={32} className="text-tertiary" />
                    </div>
                    <h4 className="font-display font-black text-xl text-tertiary mb-2">Accès Limité</h4>
                    <p className="text-xs font-semibold text-secondary leading-relaxed">
                      L'épargne et les comptes Crypto sont réservés aux membres <span className="text-tertiary font-black">PRO</span>.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="bg-green-100 p-1 rounded-full"><Check size={12} className="text-green-600" /></div>
                      <p className="text-[11px] font-bold">Synchronisation Crypto illimitée</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-green-100 p-1 rounded-full"><Check size={12} className="text-green-600" /></div>
                      <p className="text-[11px] font-bold">Gestion multi-livrets (A, LDD...)</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-green-100 p-1 rounded-full"><Check size={12} className="text-green-600" /></div>
                      <p className="text-[11px] font-bold">Zéro frais sur les imports auto</p>
                    </div>
                  </div>

                  <button 
                    onClick={handleUpgrade}
                    disabled={isUpgrading}
                    className="w-full bg-tertiary text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-tertiary/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isUpgrading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>Devenir PRO - 4.99€/mois</>
                    )}
                  </button>
                  <button 
                    onClick={() => setStep('selection')}
                    className="w-full py-2 text-[10px] font-extrabold uppercase tracking-widest text-secondary opacity-60 hover:opacity-100 transition-opacity"
                  >
                    Retour aux types de comptes
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {accountToDelete && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAccountToDelete(null)}
              className="absolute inset-0 bg-primary/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-2xl relative z-10 border border-white overflow-hidden"
            >
              <div className="flex flex-col gap-4 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <AlertCircle size={32} />
                </div>
                <h4 className="font-display font-extrabold text-xl">Supprimer le compte ?</h4>
                <p className="text-secondary text-sm">
                  Êtes-vous sûr de vouloir supprimer ce compte ? Cette action supprimera également toutes les transactions associées.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button 
                    onClick={() => setAccountToDelete(null)}
                    className="py-3 rounded-xl font-bold border border-surface-container hover:bg-surface-container-low transition-all"
                  >
                    Annuler
                  </button>
                  <button 
                    onClick={async () => {
                      if (accountToDelete) {
                        try {
                          await deleteAccount(accountToDelete);
                        } catch (e) {
                          console.error(e);
                        }
                        setAccountToDelete(null);
                      }
                    }}
                    className="py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
