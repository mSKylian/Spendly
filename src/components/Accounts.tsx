import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Landmark, Wallet, CreditCard, Bitcoin, Plus, ChevronRight, ChevronLeft, Info, AlertCircle, X, UploadCloud, FileText, Check, Trash2, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { SpendlyStore } from '../store';
import { Account, ParsedStatement } from '../types';
import { auth } from '../firebase';
import { parseStatementFile, detectFormat } from '../lib/statementParser';
import { formatTxDate } from '../lib/finance';

interface AccountsProps {
  store: SpendlyStore;
}

type ImportStep = 'choose' | 'parsing' | 'preview' | 'saving' | 'success';
type ModalMode = 'connect' | 'import' | 'manual';

const ICON_BY_TYPE: Record<Account['type'], Account['iconName']> = {
  current: 'bank', paypal: 'wallet', livret_a: 'card', crypto: 'bitcoin',
};
const COLOR_BY_TYPE: Record<Account['type'], string> = {
  current: 'bg-blue-500', paypal: 'bg-indigo-600', livret_a: 'bg-orange-500', crypto: 'bg-yellow-500',
};

// The bank "integrations" offered when linking an account.
const PROVIDERS: { type: Account['type']; name: string; bank: string; pro: boolean }[] = [
  { type: 'current', name: 'Compte Courant', bank: 'Banque (toutes)', pro: false },
  { type: 'paypal', name: 'PayPal', bank: 'PayPal', pro: false },
  { type: 'livret_a', name: 'Livret A', bank: 'Épargne', pro: true },
  { type: 'crypto', name: 'Crypto Wallet', bank: 'Bitcoin / Ethereum', pro: true },
];

export default function Accounts({ store }: AccountsProps) {
  const { accounts, transactions, totalAssets, deleteAccount, importStatement, addAccount, user } = store;

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<ModalMode>('connect');
  const [importStep, setImportStep] = useState<ImportStep>('choose');
  const [importTargetId, setImportTargetId] = useState<string | null>(null); // set = import into existing account
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [manual, setManual] = useState({ name: '', bankName: '', type: 'current' as Account['type'], openingBalance: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || null;
  const accountTx = selectedAccountId ? transactions.filter((t) => t.accountId === selectedAccountId) : [];

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const resetModal = () => { setImportStep('choose'); setParsed(null); setFileName(''); setError(null); setShowUpgrade(false); };
  const closeModal = () => { setShowModal(false); setImportTargetId(null); setMode('connect'); resetModal(); setManual({ name: '', bankName: '', type: 'current', openingBalance: '' }); };

  const openAddModal = () => { setImportTargetId(null); setMode('connect'); resetModal(); setShowModal(true); };
  const openImportForAccount = (accId: string) => { setImportTargetId(accId); setMode('import'); resetModal(); setShowModal(true); };

  const readAsText = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); });
  const readAsDataURL = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

  const handleConnectProvider = async (p: typeof PROVIDERS[number]) => {
    setError(null);
    if (p.pro && user?.tier !== 'pro') { setShowUpgrade(true); return; }
    try {
      const id = await addAccount({
        name: p.name,
        bankName: p.bank,
        balance: 0,
        openingBalance: 0,
        type: p.type,
        iconName: ICON_BY_TYPE[p.type],
        colorClass: COLOR_BY_TYPE[p.type],
        currency: 'EUR',
        source: 'manual',
      });
      closeModal();
      // Land on the new account so the user can import a statement to fund it.
      if (typeof id === 'string') setSelectedAccountId(id);
    } catch (e) {
      setError("Échec de la création du compte.");
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    const ext = detectFormat(file.name);
    try {
      if (ext) {
        const text = await readAsText(file);
        setParsed(parseStatementFile(file.name, text));
        setImportStep('preview');
      } else if (/\.pdf$/i.test(file.name) || file.type.startsWith('image/')) {
        setImportStep('parsing');
        const dataUri = await readAsDataURL(file);
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/parse-statement', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: dataUri, mimeType: file.type }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Échec de l'analyse du relevé."); }
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
      const id = await importStatement(parsed, importTargetId ?? undefined);
      setImportStep('success');
      setTimeout(() => {
        const target = importTargetId ?? (typeof id === 'string' ? id : null);
        closeModal();
        if (target) setSelectedAccountId(target);
      }, 1200);
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
      const id = await addAccount({
        name: manual.name || 'Compte', bankName: manual.bankName || 'Banque',
        balance: opening, openingBalance: opening, type: manual.type,
        iconName: ICON_BY_TYPE[manual.type], colorClass: COLOR_BY_TYPE[manual.type],
        currency: 'EUR', source: 'manual',
      });
      closeModal();
      if (typeof id === 'string') setSelectedAccountId(id);
    } catch (err) {
      setError('Échec de la création du compte.');
    }
  };

  const getIcon = (name: string, color: string) => {
    const p = { size: 24, className: 'text-white' };
    const wrap = (el: React.ReactNode) => <div className={`p-2.5 rounded-xl ${color}`}>{el}</div>;
    switch (name) {
      case 'bank': return wrap(<Landmark {...p} />);
      case 'wallet': return wrap(<Wallet {...p} />);
      case 'bitcoin': return wrap(<Bitcoin {...p} />);
      case 'card': return wrap(<CreditCard {...p} />);
      default: return wrap(<Landmark {...p} />);
    }
  };

  // -------------------------------------------------------------------------
  // Account detail view
  // -------------------------------------------------------------------------
  if (selectedAccount) {
    return (
      <div className="flex flex-col gap-6 pb-32">
        <button onClick={() => setSelectedAccountId(null)} className="flex items-center gap-1 text-secondary text-sm font-bold mt-2 hover:text-primary transition-colors self-start">
          <ChevronLeft size={18} /> Mes comptes
        </button>

        <section className="bg-gradient-to-br from-primary-container to-primary text-white p-6 rounded-2xl shadow-xl">
          <div className="flex items-center gap-4 mb-4">
            {getIcon(selectedAccount.iconName, 'bg-white/15')}
            <div className="min-w-0">
              <h2 className="font-display font-extrabold text-lg leading-tight truncate">{selectedAccount.name}</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 truncate">
                {selectedAccount.bankName}{selectedAccount.ibanLast4 ? ` ••${selectedAccount.ibanLast4}` : ''}
              </p>
            </div>
          </div>
          <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">Solde</p>
          <p className="font-display text-3xl font-extrabold tracking-tight">{fmt(selectedAccount.balance)} €</p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => openImportForAccount(selectedAccount.id)}
            className="flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95">
            <UploadCloud size={18} /> Importer un relevé
          </button>
          <button onClick={() => setAccountToDelete(selectedAccount.id)}
            className="flex items-center justify-center gap-2 border border-surface-container text-secondary py-3 rounded-2xl font-bold hover:bg-red-50 hover:text-red-500 transition-all active:scale-95">
            <Trash2 size={18} /> Supprimer
          </button>
        </div>

        <section>
          <h3 className="font-display font-extrabold text-lg mb-3">Transactions</h3>
          {accountTx.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center border border-dashed border-surface-container">
              <p className="text-sm font-medium text-secondary">Aucune transaction pour ce compte.</p>
              <p className="text-xs text-secondary/70 mt-1">Importe un relevé pour ajouter ses transactions.</p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-2xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] divide-y divide-surface-container">
              {accountTx.map((t) => (
                <div key={t.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{t.name}</p>
                      <p className="text-[10px] font-medium text-secondary uppercase tracking-tight">{formatTxDate(t.date)} · {t.category}</p>
                    </div>
                  </div>
                  <p className={`font-display font-extrabold shrink-0 ml-3 ${t.amount < 0 ? 'text-error' : 'text-primary'}`}>
                    {t.amount < 0 ? '-' : '+'} {fmt(Math.abs(t.amount))} €
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {renderModal()}
        {renderDeleteModal(() => setSelectedAccountId(null))}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Accounts list view
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-8 pb-32">
      <section className="mt-4">
        <div className="bg-gradient-to-br from-primary-container to-primary text-white p-6 rounded-2xl shadow-xl relative overflow-hidden transition-transform active:scale-[0.99]">
          <div className="flex flex-col relative z-10">
            <p className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1">Patrimoine total</p>
            <h2 className="font-display text-4xl font-extrabold tracking-tight mb-6">{fmt(totalAssets)} €</h2>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (<div key={i} className="w-6 h-6 rounded-full border-2 border-primary bg-white/20 backdrop-blur-sm" />))}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tight opacity-90">{accounts.length} compte{accounts.length > 1 ? 's' : ''} lié{accounts.length > 1 ? 's' : ''}</span>
            </div>
          </div>
          <motion.div initial={{ opacity: 0, rotate: -20, scale: 0.5 }} animate={{ opacity: 0.15, rotate: 0, scale: 1 }} className="absolute -right-4 -bottom-4 text-white">
            <Landmark size={140} />
          </motion.div>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-display font-extrabold text-lg">Mes Comptes</h3>
          <button onClick={openAddModal} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 hover:scale-110 active:scale-95 transition-all">
            <Plus size={20} />
          </button>
        </div>

        {accounts.length === 0 && (
          <button onClick={openAddModal} className="w-full bg-surface-container-lowest rounded-2xl p-8 border border-dashed border-primary/30 flex flex-col items-center gap-2 text-center hover:border-primary/60 transition-all">
            <Landmark size={32} className="text-primary" />
            <p className="font-bold text-sm">Lie ton premier compte</p>
            <p className="text-xs text-secondary">Connecte une banque, importe un relevé, ou ajoute-le manuellement.</p>
          </button>
        )}

        <div className="flex flex-col gap-4">
          {accounts.map((account) => (
            <motion.button
              key={account.id}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              onClick={() => setSelectedAccountId(account.id)}
              className="w-full text-left bg-surface-container-lowest rounded-2xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex items-center justify-between border border-white group hover:border-primary/20 transition-all"
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
                <p className="font-display font-extrabold text-base tracking-tight text-right">{fmt(account.balance)} €</p>
                <ChevronRight size={16} className="text-secondary opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 flex items-center justify-center gap-2 border border-surface-container">
        <Info size={14} className="text-secondary" />
        <p className="text-[10px] font-bold text-secondary uppercase tracking-widest text-center">Tes soldes proviennent des relevés que tu importes</p>
      </div>

      {renderModal()}
      {renderDeleteModal()}
    </div>
  );

  // -------------------------------------------------------------------------
  // Shared modals (declared as closures so both views reuse them)
  // -------------------------------------------------------------------------
  function renderModal() {
    return (
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal} className="absolute inset-0 bg-primary/20 backdrop-blur-md" />
            <motion.div initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }} className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-2xl relative z-10 border border-white overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-display font-extrabold text-xl">
                  {importTargetId ? 'Importer un relevé' : 'Lier un compte'}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-surface-container rounded-full transition-colors"><X size={20} /></button>
              </div>

              {/* Mode tabs — only when creating a new account (not importing into an existing one) */}
              {!importTargetId && importStep === 'choose' && !showUpgrade && (
                <div className="flex bg-surface-container p-1 rounded-xl mb-5">
                  {([['connect', 'Connecter'], ['import', 'Relevé'], ['manual', 'Manuel']] as const).map(([m, label]) => (
                    <button key={m} onClick={() => { setMode(m); setError(null); }}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all ${mode === m ? 'bg-primary text-white shadow' : 'text-secondary'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-600 flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              {/* Upgrade gate for Pro-only providers */}
              {showUpgrade && (
                <div className="py-2 flex flex-col gap-5">
                  <div className="bg-tertiary/10 p-6 rounded-2xl border border-tertiary/20 text-center relative overflow-hidden">
                    <Sparkles size={48} className="text-tertiary fill-tertiary/20 absolute -right-4 -top-4 rotate-12 opacity-30" />
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4"><ShieldCheck size={32} className="text-tertiary" /></div>
                    <h4 className="font-display font-black text-xl text-tertiary mb-2">Réservé aux PRO</h4>
                    <p className="text-xs font-semibold text-secondary leading-relaxed">Les comptes Livret A et Crypto nécessitent un abonnement <span className="text-tertiary font-black">PRO</span>.</p>
                  </div>
                  <button onClick={() => setShowUpgrade(false)} className="w-full py-2 text-[10px] font-extrabold uppercase tracking-widest text-secondary opacity-60 hover:opacity-100 transition-opacity">Retour</button>
                </div>
              )}

              {/* CONNECT — provider integrations */}
              {!importTargetId && mode === 'connect' && !showUpgrade && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-widest opacity-70">Choisis un type de compte</p>
                  {PROVIDERS.map((p) => {
                    const locked = p.pro && user?.tier !== 'pro';
                    return (
                      <button key={p.type} onClick={() => handleConnectProvider(p)}
                        className="w-full p-3 rounded-2xl flex items-center justify-between border bg-surface-container-low border-surface-container hover:border-primary/30 hover:bg-surface-container active:scale-[0.98] transition-all">
                        <div className="flex items-center gap-3">
                          {getIcon(ICON_BY_TYPE[p.type], COLOR_BY_TYPE[p.type])}
                          <div className="text-left">
                            <p className="font-bold text-sm leading-tight">{p.name}</p>
                            <p className="text-[10px] font-bold text-secondary uppercase tracking-tight">{p.bank}</p>
                          </div>
                        </div>
                        {locked
                          ? <div className="flex items-center gap-1 bg-tertiary/10 text-tertiary px-2 py-1 rounded-full border border-tertiary/20"><Sparkles size={10} /><span className="text-[9px] font-black uppercase">PRO</span></div>
                          : <ChevronRight size={16} className="text-secondary opacity-40" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* IMPORT — file chooser (used both for new-account import and import-into-existing) */}
              {(importTargetId || mode === 'import') && importStep === 'choose' && !showUpgrade && (
                <div className="space-y-4">
                  <input ref={fileInputRef} type="file" accept=".csv,.ofx,.qif,.pdf,image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} />
                  <button onClick={() => fileInputRef.current?.click()} className="w-full py-10 rounded-2xl border-2 border-dashed border-primary/30 flex flex-col items-center gap-3 hover:border-primary/60 hover:bg-primary/5 transition-all">
                    <UploadCloud size={40} className="text-primary" />
                    <div className="text-center"><p className="font-bold text-sm">Choisir un relevé</p><p className="text-[11px] text-secondary mt-0.5">CSV, OFX, QIF, PDF ou image</p></div>
                  </button>
                  <p className="text-[10px] text-secondary text-center leading-relaxed">
                    {importTargetId ? 'Les transactions sont ajoutées à ce compte et son solde est mis à jour.' : 'Le compte et ses transactions sont créés à partir du relevé.'}
                  </p>
                </div>
              )}

              {(importTargetId || mode === 'import') && importStep === 'parsing' && (
                <div className="py-12 flex flex-col items-center gap-4 text-center">
                  <Loader2 size={40} className="text-primary animate-spin" />
                  <div><h4 className="font-bold text-base mb-1">Analyse du relevé…</h4><p className="text-xs text-secondary font-medium">{fileName}</p></div>
                </div>
              )}

              {(importTargetId || mode === 'import') && importStep === 'preview' && parsed && (
                <div className="space-y-4">
                  <div className="bg-surface-container-low rounded-2xl p-4 border border-surface-container">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-blue-500"><Landmark size={20} className="text-white" /></div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{importTargetId ? selectedAccount?.name : parsed.account.name}</p>
                        <p className="text-[10px] font-bold text-secondary uppercase tracking-tight truncate">{parsed.account.bankName}{parsed.account.ibanLast4 ? ` ••${parsed.account.ibanLast4}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-secondary font-bold uppercase tracking-wider text-[10px]">{importTargetId ? 'Nouveau solde' : 'Solde importé'}</span>
                      <span className="font-display font-extrabold">{fmt(parsed.account.closingBalance)} {parsed.account.currency || 'EUR'}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-2">{parsed.transactions.length} transaction{parsed.transactions.length > 1 ? 's' : ''}</p>
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-surface-container divide-y divide-surface-container">
                      {parsed.transactions.slice(0, 30).map((t, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 text-xs">
                          <div className="min-w-0 flex items-center gap-2"><FileText size={14} className="text-secondary shrink-0" /><span className="truncate font-medium">{t.label}</span></div>
                          <span className={`font-display font-extrabold shrink-0 ml-2 ${t.amount < 0 ? 'text-error' : 'text-primary'}`}>{t.amount < 0 ? '-' : '+'} {fmt(Math.abs(t.amount))} €</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={resetModal} className="py-3 rounded-xl font-bold border border-surface-container hover:bg-surface-container-low transition-all">Annuler</button>
                    <button onClick={confirmImport} className="py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95">Importer</button>
                  </div>
                </div>
              )}

              {(importTargetId || mode === 'import') && importStep === 'saving' && (
                <div className="py-12 flex flex-col items-center gap-4 text-center"><Loader2 size={40} className="text-primary animate-spin" /><h4 className="font-bold text-base">Enregistrement…</h4></div>
              )}

              {(importTargetId || mode === 'import') && importStep === 'success' && (
                <div className="py-12 flex flex-col items-center gap-6 text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-green-500/20"><Check size={40} strokeWidth={3} /></motion.div>
                  <div><h4 className="font-bold text-lg mb-1">Relevé importé !</h4><p className="text-xs text-secondary font-medium">Compte et transactions à jour.</p></div>
                </div>
              )}

              {/* MANUAL */}
              {!importTargetId && mode === 'manual' && !showUpgrade && (
                <form onSubmit={submitManual} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Nom du compte</label>
                    <input value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} required placeholder="Compte Courant" className="w-full bg-surface-container-low border border-surface-container p-3.5 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Banque</label>
                    <input value={manual.bankName} onChange={e => setManual({ ...manual, bankName: e.target.value })} placeholder="BNP, Revolut…" className="w-full bg-surface-container-low border border-surface-container p-3.5 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Type</label>
                      <select value={manual.type} onChange={e => setManual({ ...manual, type: e.target.value as Account['type'] })} className="w-full bg-surface-container-low border border-surface-container p-3.5 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all appearance-none">
                        <option value="current">Compte Courant</option><option value="paypal">PayPal</option><option value="livret_a">Livret A (Pro)</option><option value="crypto">Crypto (Pro)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-secondary ml-1">Solde d'ouverture</label>
                      <input value={manual.openingBalance} onChange={e => setManual({ ...manual, openingBalance: e.target.value })} type="number" step="0.01" placeholder="0.00" className="w-full bg-surface-container-low border border-surface-container p-3.5 rounded-2xl text-sm font-bold focus:outline-none focus:border-primary transition-all" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-primary text-white py-4 rounded-2xl font-extrabold uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 mt-2">Créer le compte</button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  function renderDeleteModal(afterDelete?: () => void) {
    return (
      <AnimatePresence>
        {accountToDelete && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAccountToDelete(null)} className="absolute inset-0 bg-primary/20 backdrop-blur-md" />
            <motion.div initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }} className="w-full max-w-sm bg-surface-container-lowest rounded-3xl p-6 shadow-2xl relative z-10 border border-white overflow-hidden">
              <div className="flex flex-col gap-4 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2"><AlertCircle size={32} /></div>
                <h4 className="font-display font-extrabold text-xl">Supprimer le compte ?</h4>
                <p className="text-secondary text-sm">Cette action supprimera aussi toutes les transactions associées.</p>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button onClick={() => setAccountToDelete(null)} className="py-3 rounded-xl font-bold border border-surface-container hover:bg-surface-container-low transition-all">Annuler</button>
                  <button onClick={async () => { if (accountToDelete) { try { await deleteAccount(accountToDelete); } catch (e) { console.error(e); } setAccountToDelete(null); afterDelete?.(); } }} className="py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-95">Supprimer</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }
}
