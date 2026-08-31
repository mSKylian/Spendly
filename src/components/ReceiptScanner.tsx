import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Upload, X, Loader2, CheckCircle2, AlertCircle, ShoppingBag, TrendingDown, Save } from 'lucide-react';
import { toISODate } from '../lib/finance';

interface ReceiptScannerProps {
  onScan: (base64Image: string) => Promise<any>;
  onSave: (t: any) => Promise<void>;
  onClose: () => void;
  accounts: any[];
}

export default function ReceiptScanner({ onScan, onSave, onClose, accounts }: ReceiptScannerProps) {
  const [image, setImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const startScan = async () => {
    if (!image) return;
    setScanning(true);
    setError(null);
    try {
      const data = await onScan(image);
      setResult(data);
    } catch (err) {
      setError("Désolé, je n'ai pas pu lire ce ticket. Réessaie avec une photo plus nette.");
    } finally {
      setScanning(false);
    }
  };

  const handleSaveTransaction = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await onSave({
        name: result.merchant || 'Achat Scanner',
        amount: -Math.abs(result.total || 0),
        category: 'Nourriture',
        date: toISODate(result.date),
        iconName: 'shopping-cart',
        accountId: selectedAccountId || accounts[0]?.id || '',
        status: 'completed'
      });
      onClose();
    } catch (err) {
      setError("Erreur lors de l'enregistrement de la transaction.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-2xl border border-surface-container-low max-w-md w-full mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display font-extrabold text-xl tracking-tight text-primary">Scan de Ticket</h3>
          <p className="text-xs text-secondary font-bold uppercase tracking-widest mt-1">Analyse intelligente par Spendly</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
          <X size={20} className="text-secondary" />
        </button>
      </div>

      {!image && !result && (
        <div className="flex flex-col gap-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square border-2 border-dashed border-surface-container-high rounded-3xl flex flex-col items-center justify-center gap-3 hover:border-primary/40 hover:bg-primary/5 transition-all group"
          >
            <div className="w-16 h-16 bg-surface-container flex items-center justify-center rounded-2xl group-hover:scale-110 transition-transform">
              <Camera size={32} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold">Prendre en photo</p>
              <p className="text-[10px] text-secondary font-medium">Ticket de caisse complet</p>
            </div>
          </button>
          
          <input 
            type="file" 
            accept="image/*" 
            capture="environment"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {image && !result && (
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-black border border-surface-container-high">
            <img src={image} alt="Ticket" className="w-full h-full object-contain" />
            {scanning && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-white">
                <Loader2 className="w-10 h-10 animate-spin mb-3 text-primary" />
                <p className="text-sm font-extrabold uppercase tracking-widest">Analyse en cours...</p>
                <div className="w-48 h-1 bg-white/20 rounded-full mt-4 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="h-full bg-primary"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button 
              disabled={scanning}
              onClick={() => { setImage(null); setError(null); }}
              className="flex-1 py-4 bg-surface-container text-secondary rounded-2xl font-bold text-sm transition-all hover:bg-surface-container-high disabled:opacity-50"
            >
              Annuler
            </button>
            <button 
              disabled={scanning}
              onClick={startScan}
              className="flex-[2] py-4 bg-primary text-on-primary rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {scanning ? 'Analyse...' : 'Lancer l\'analyse'}
            </button>
          </div>
          {error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex items-start gap-3">
              <AlertCircle size={18} className="text-error shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-error leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="bg-primary/5 rounded-2xl p-5 border border-primary/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <ShoppingBag size={20} className="text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">{result.merchant || 'Marchand inconnu'}</h4>
                  <p className="text-[10px] text-secondary font-medium">{result.date || 'Date non détectée'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-primary">{result.total?.toFixed(2)}€</p>
                <p className="text-[10px] text-secondary font-bold uppercase">Total Ticket</p>
              </div>
            </div>

            <div className="space-y-2 border-t border-primary/10 pt-4">
              <p className="text-[10px] font-extrabold text-secondary uppercase tracking-widest mb-2">Détail des achats</p>
              {result.items?.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="font-medium opacity-80">{item.name}</span>
                  <span className="font-bold">{item.price?.toFixed(2)}€</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingDown size={18} className="text-green-600" />
              <h4 className="font-display font-extrabold text-sm uppercase tracking-tight">Analyse de réduction</h4>
            </div>
            <div className="p-4 bg-green-50 rounded-2xl border border-green-100 italic text-xs leading-relaxed text-green-900 shadow-sm shadow-green-900/5">
              "{result.analysis}"
            </div>
          </div>

          {result.suggestedChallenges?.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-extrabold text-secondary uppercase tracking-widest">Nouveaux défis débloqués</p>
              {result.suggestedChallenges.map((ch: any, idx: number) => (
                <div key={idx} className="p-3 bg-surface-container rounded-xl flex items-center gap-3 border border-surface-container-high transition-transform hover:scale-[1.02]">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <TrendingDown size={16} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <h5 className="text-[11px] font-bold">{ch.title}</h5>
                    <p className="text-[9px] text-secondary leading-tight opacity-80">{ch.description}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-primary">+{ch.potentialSaving}€</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 mt-2">
            <p className="text-[10px] font-extrabold text-secondary uppercase tracking-widest">Compte à débiter</p>
            <select 
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-surface-container p-4 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none border-none"
            >
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div className="flex gap-3 mt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 bg-surface-container text-secondary rounded-2xl font-bold text-sm transition-all hover:bg-surface-container-high"
            >
              Fermer
            </button>
            <button 
              disabled={saving}
              onClick={handleSaveTransaction}
              className="flex-[2] py-4 bg-primary text-on-primary rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
