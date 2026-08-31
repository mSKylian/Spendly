import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Landmark, Wallet, CreditCard, Bitcoin, Plus, ChevronRight, Info, AlertCircle, X, UploadCloud, FileText, Check, Trash2, Loader2 } from 'lucide-react';
import { SpendlyStore } from '../store';
import { Account, ParsedStatement } from '../types';
import { auth } from '../firebase';
import { parseStatementFile, detectFormat } from '../lib/statementParser';

interface AccountsProps {
  store: SpendlyStore;
}

type ImportStep = 'choose' | 'parsing' | 'preview' | 'saving' | 'success';

const ICON_BY_TYPE: Record<Account['type'], Account['iconName']> = {
  current: 'bank', paypal: 'wallet', livret_a: 'card', crypto: 'bitcoin',
};
const COLOR_BY_TYPE: Record<Account['type'], string> = {
  current: 'bg-blue-500', paypal: 'bg-indigo-600', livret_a: 'bg-orange-500', crypto: 'bg-yellow-500',
};

export default function Accounts({ store }: AccountsProps) {
  const { accounts, totalAssets, deleteAccount, importStatement, addAccount, user } = store;
  const [showConnect, setShowConnect] = useState(false);
  const [mode, setMode] = useState<'import' | 'manual'>('import');
  const [importStep, setImportStep] = useState<ImportStep>('choose');
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState({ name: '', bankName: '', type: 'current' as Account['type'], openingBalance: '' });

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  };

  const resetImport = () => { setImportStep('choose'); setParsed(null); setFileName(''); setError(null); };
  const closeModal = () => { setShowConnect(false); resetImport(); setMode('import'); setManual({ name: '', bankName: '', type: 'current', openingBalance: '' }); };

  const readAsText = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); });
  const readAsDataURL = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    const ext = detectFormat(file.name);
    try {
      if (ext) {
        // CSV / OFX / QIF — parsed deterministically in the browser.
        const text = await readAsText(file);
        setParsed(parseStatementFile(file.name, text));
        setImportStep('preview');
      } else if (/\.pdf$/i.test(file.name) || file.type.startsWith('image/')) {
        // PDF / image — parsed by the server LLM endpoint.
        setImportStep('parsing');
        const dataUri = await readAsDataURL(file);
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/parse-statement', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: dataUri, mimeType: file.type }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || "Échec de l'analyse du relevé.");
        }
        setParsed(await res.json());
        setImportStep('preview');
      } else {
        throw new Error('Format non supporté. Utilisez CSV, OFX, QIF, PDF ou une image.');
      }
    } catch (e: any) {
      setError(e.message || 'Impossible de lire ce fichier.');
      setImportStep('choose');
    }
  };

  const confirmImport = async () => {
    if (!parsed) return;
    setImportStep('saving');
    try {
      await importStatement(parsed);
      setImportStep('success');
      setTimeout(closeModal, 1500);
    } catch (e) {
      setError("Échec de l'enregistrement du relevé.");
      setImportStep('preview');
    }
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const opening = Number(manual.openingBalance) || 0;
    if ((manual.type === 'livret_a' || manual.type === 'crypto') && user?.tier !== 'pro') {
      setError('Les comptes Livret A et Crypto sont réservés aux membres Pro.');
      return;
    }
    try {
      await addAccount({
        name: manual.name || 'Compte',
        bankName: manual.bankName || 'Banque',
        balance: opening,
        openingBalance: opening,
        type: manual.type,
        iconName: ICON_BY_TYPE[manual.type],
        colorClass: COLOR_BY_TYPE[manual.type],
        currency: 'EUR',
        source: 'manual',
      });
      closeModal();
    } catch (err) {
      setError('Échec de la création du compte.');
    }
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
              {fmt(totalAssets)} €
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-primary bg-white/20 backdrop-blur-sm" />
                 ))}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tight opacity-90">{accounts.length} compte{accounts.length > 1 ? 's' : ''} lié{accounts.length > 1 ? 's' : ''}</span>
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
            onClick={() => { setShowConnect(true); setMode('import'); resetImport(); }}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 hover:scale-110 active:scale-95 transition-all"
          >
            <Plus size={20} />
          </button>
        </div>

        {accounts.length === 0 && (
          <button
            onClick={() => { setShowConnect(true); setMode('import'); resetImport(); }}
            className="w-full bg-surface-container-lowest rounded-2xl p-8 border border-dashed border-primary/30 flex flex-col items-center gap-2 text-center hover:border-primary/60 transition-all"
          >
            <UploadCloud size={32} className="text-primary" />
            <p className="font-bold text-sm">Importe ton premier relevé</p>
            <p className="text-xs text-secondary">CSV, OFX, QIF, PDF ou photo — tes vraies transactions.</p>
          </button>
        )}

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
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-tight opacity-60">
                    {account.bankName}{account.ibanLast4 ? ` ••${account.ibanLast4}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-display font-extrabold text-base tracking-tight text-right">
                  {fmt(account.balance)} €
                </p>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setAccountToDelete(account.id); }}
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

      {/* Connection Info */}
      <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 flex items-center justify-center gap-2 border border-surface-container">
        <Info size={14} className="text-secondary" />
        <p className="text-[10px] font-bold text-secondary uppercase tracking-widest text-center">
          Tes soldes proviennent des relevés que tu importes
        </p>
      </div>

      {/* Add / Import Account Modal */}
      <AnimatePresence>
        {showConnect && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-primary/20 backdrop-blur-md"
            />
            <motion.div
              initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }}
              className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-2xl relative z-10 border border-white overflow-hidden"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-display font-extrabold text-xl">Lier un compte</h3>
                <button onClick={closeModal} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Mode switch (only on the first step) */}
              {(importStep === 'choose') && (
                <div className="flex bg-surface-container p-1 rounded-xl mb-5">
                  {(['import', 'manual'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setError(null); }}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all ${mode === m ? 'bg-primary text-white shadow' : 'text-secondary'}`}
                    >
                      {m === 'import' ? 'Importer un relevé' : 'Compte manuel'}
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-600 flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              {/* IMPORT — choose file */}
              {mode === 'import' && importStep === 'choose' && (
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.ofx,.qif,.pdf,image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-10 rounded-2xl border-2 border-dashed border-primary/30 flex flex-col items-center gap-3 hover:border-primary/60 hover:bg-primary/5 transition-all"
                  >
                    <UploadCloud size={40} className="text-primary" />
                    <div className="text-center">
                      <p className="font-bold text-sm">Choisir un relevé</p>
                      <p className="text-[11px] text-secondary mt-0.5">CSV, OFX, QIF, PDF ou image</p>
                    </div>
                  </button>
                  <p className="text-[10px] text-secondary text-center leading-relaxed">
                    Ton relevé est analysé pour créer le compte et ses transactions. Le solde du compte vient du relevé.
                  </p>
                </div>
              )}

              {/* IMPORT — parsing */}
              {mode === 'import' && importStep === 'parsing' && (
                <div className="py-12 flex flex-col items-center gap-4 text-center">
                  <Loader2 size={40} className="text-primary animate-spin" />
                  <div>
                    <h4 className="font-bold text-base mb-1">Analyse du relevé…</h4>
                    <p className="text-xs text-secondary font-medium">{fileName}</p>
                  </div>
                </div>
              )}

              {/* IMPORT — preview */}
              {mode === 'import' && importStep === 'preview' && parsed && (
                <div className="space-y-4">
                  <div className="bg-surface-container-low rounded-2xl p-4 border border-surface-container">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-blue-500"><Landmark size={20} className="text-white" /></div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{parsed.account.name}</p>
                        <p className="text-[10px] font-bold text-secondary uppercase tracking-tight truncate">
                          {parsed.account.bankName}{parsed.account.ibanLast4 ? ` ••${parsed.account.ibanLast4}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-secondary font-bold uppercase tracking-wider text-[10px]">Solde importé</span>
                      <span className="font-display font-extrabold">{fmt(parsed.account.closingBalance)} {parsed.account.currency || 'EUR'}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">
                      {parsed.transactions.length} transaction{parsed.transactions.length > 1 ? 's' : ''}
                    </p>
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-surface-container divide-y divide-surface-container">
                      {parsed.transactions.slice(0, 30).map((t, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 text-xs">
                          <div className="min-w-0 flex items-center gap-2">
                            <FileText size={14} className="text-secondary shrink-0" />
                            <span className="truncate font-medium">{t.label}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-secondary">{fmtDate(t.date)}</span>
                            <span className={`font-display font-extrabold ${t.amount < 0 ? 'text-error' : 'text-primary'}`}>
                              {t.amount < 0 ? '-' : '+'} {fmt(Math.abs(t.amount))} €
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={resetImport} className="py-3 rounded-xl font-bold border border-surface-container hover:bg-surface-container-low transition-all">
                      Annuler
                    </button>
                    <button onClick={confirmImport} className="py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95">
                      Importer
                    </button>
                  </div>
                </div>
              )}

              {/* IMPORT — saving */}
              {mode === 'import' && importStep === 'saving' && (
                <div className="py-12 flex flex-col items-center gap-4 text-center">
                  <Loader2 size={40} className="text-primary animate-spin" />
                  <h4 className="font-bold text-base">Enregistrement…</h4>
                </div>
              )}

              {/* IMPORT — success */}
              {mode === 'import' && importStep === 'success' && (
                <div className="py-12 flex flex-col items-center gap-6 text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-green-500/20">
                    <Check size={40} strokeWidth={3} />
                  </motion.div>
                  <div>
                    <h4 className="font-bold text-lg mb-1">Relevé importé !</h4>
                    <p className="text-xs text-secondary font-medium">Ton compte et ses transactions sont ajoutés.</p>
                  </div>
                </div>
              )}

              {/* MANUAL */}
              {mode === 'manual' && importStep === 'choose' && (
                <form onSubmit={submitManual} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Nom du compte</label>
                    <input value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} required placeholder="Compte Courant"
                      className="w-full bg-surface-container-low border border-surface-container p-3.5 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Banque</label>
                    <input value={manual.bankName} onChange={e => setManual({ ...manual, bankName: e.target.value })} placeholder="BNP, Revolut…"
                      className="w-full bg-surface-container-low border border-surface-container p-3.5 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Type</label>
                      <select value={manual.type} onChange={e => setManual({ ...manual, type: e.target.value as Account['type'] })}
                        className="w-full bg-surface-container-low border border-surface-container p-3.5 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all appearance-none">
                        <option value="current">Compte Courant</option>
                        <option value="paypal">PayPal</option>
                        <option value="livret_a">Livret A (Pro)</option>
                        <option value="crypto">Crypto (Pro)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Solde d'ouverture</label>
                      <input value={manual.openingBalance} onChange={e => setManual({ ...manual, openingBalance: e.target.value })} type="number" step="0.01" placeholder="0.00"
                        className="w-full bg-surface-container-low border border-surface-container p-3.5 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-primary text-white py-4 rounded-2xl font-extrabold uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 mt-2">
                    Créer le compte
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}

        {accountToDelete && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setAccountToDelete(null)}
              className="absolute inset-0 bg-primary/20 backdrop-blur-md"
            />
            <motion.div
              initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }}
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
                  <button onClick={() => setAccountToDelete(null)}
                    className="py-3 rounded-xl font-bold border border-surface-container hover:bg-surface-container-low transition-all">
                    Annuler
                  </button>
                  <button
                    onClick={async () => {
                      if (accountToDelete) {
                        try { await deleteAccount(accountToDelete); } catch (e) { console.error(e); }
                        setAccountToDelete(null);
                      }
                    }}
                    className="py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95">
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
