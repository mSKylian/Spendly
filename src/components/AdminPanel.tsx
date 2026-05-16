import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Save, AlertCircle, Check, Key, Shield, Smartphone } from 'lucide-react';
import { auth } from '../firebase';

export default function AdminPanel() {
  const [config, setConfig] = useState<any>({
    isEnabled: true,
    provider: 'openai',
    url: '',
    model: 'gpt-4o-mini',
    apiKey: '',
    maxTransactions: 50,
    maintenanceMode: false,
    allowSignups: true,
    announcement: '',
    systemPrompt: "Tu es un conseiller financier expert. Tu vas recevoir une liste de transactions au format JSON. Identifie 2 à 3 recommandations spécifiques pour que l'utilisateur puisse faire des économies directes sur ses dépenses récurrentes ou superflues.\n\nRenvoie UNIQUEMENT un objet JSON avec la clé 'recommendations' contenant un tableau d'objets. Chaque objet doit avoir cette structure EXACTE :\n- \"title\" (titre court)\n- \"subtitle\" (nom du marchand ou sous-titre)\n- \"description\" (explication de l'économie)\n- \"potentialSaving\" (nombre en euros)\n- \"category\" (nom de catégorie courte, ex: \"Abonnement\")\n- \"status\": \"available\"\n- \"level\": 1, 2 ou 3 selon la difficulté."
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [isDenied, setIsDenied] = useState(false);
  const [isEligibleForBootstrap, setIsEligibleForBootstrap] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      
      const email = user.email || '';
      const ADMIN_EMAILS = ['kylian.allaoui@gmail.com', 'admin@spendly.com', 'kylian.allaoui@icloud.com', 'allaoui.zouhair@gmail.com'];
      if (ADMIN_EMAILS.includes(email)) {
         setIsEligibleForBootstrap(true);
      }

      const token = await user.getIdToken();
      const res = await fetch('/api/admin/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Object.keys(data).length > 0) {
          setConfig((prev: any) => ({ ...prev, ...data }));
        }
      } else if (res.status === 403) {
         setIsDenied(true);
      } else {
        setMessage({ type: 'error', text: 'Erreur lors du chargement de la configuration.' });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async () => {
     try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/admin/bootstrap', {
           method: 'POST',
           headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
           setIsDenied(false);
           fetchConfig();
        }
     } catch (e) {
        console.error(e);
     }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Configuration sauvegardée avec succès.' });
        // Clear api key from state for security
        setConfig((prev: any) => ({ ...prev, apiKey: '' }));
      } else {
        setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Erreur réseau.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  if (isDenied) {
     if (isEligibleForBootstrap) {
        return (
           <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-white mt-8 text-center flex flex-col gap-4">
              <div className="w-16 h-16 bg-primary/10 text-primary mx-auto rounded-full flex items-center justify-center">
                 <Shield size={32} />
              </div>
              <div>
                <h3 className="font-display font-extrabold text-lg">Mode Développeur</h3>
                <p className="text-secondary text-sm">Puisque tu es le développeur, tu peux t'octroyer les droits administrateur.</p>
              </div>
              <button onClick={handleBootstrap} className="bg-primary text-on-primary py-3 px-6 rounded-xl font-bold hover:bg-primary/90 transition-all mx-auto">
                 Devenir Administrateur
              </button>
           </div>
        );
     }
     return null;
  }

  return (
    <div className="py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
          <Settings size={20} />
        </div>
        <div>
          <h2 className="font-display font-extrabold text-xl">Administration LLM</h2>
          <p className="text-secondary text-xs">Configuration de l'IA (Réservé aux Admins)</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message.type === 'error' ? <AlertCircle size={20} /> : <Check size={20} />}
          <p className="font-medium text-sm">{message.text}</p>
        </div>
      )}

      {/* GLOBAL APPLICATION CONFIG */}
      <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-surface-container-low flex flex-col gap-6 mb-8">
        <h3 className="font-display font-extrabold text-lg flex items-center gap-2 mb-2">
          <Smartphone size={20} className="text-primary"/> Paramètres Application
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center justify-between pb-4 border-b border-surface-container-low">
            <div>
              <label className="block text-sm font-bold">Mode Maintenance</label>
              <p className="text-xs text-secondary mt-1">Interdire l'accès à l'application.</p>
            </div>
            <button 
              onClick={() => setConfig({...config, maintenanceMode: !config.maintenanceMode})}
              className={`w-14 h-8 rounded-full flex items-center p-1 transition-all ${config.maintenanceMode ? 'bg-error' : 'bg-surface-container-high'}`}
            >
              <motion.div 
                layout
                className="w-6 h-6 bg-white rounded-full shadow-sm"
                style={{ x: config.maintenanceMode ? 24 : 0 }}
              />
            </button>
          </div>

          <div className="flex items-center justify-between pb-4 border-b border-surface-container-low">
            <div>
              <label className="block text-sm font-bold">Inscriptions</label>
              <p className="text-xs text-secondary mt-1">Autoriser les nouveaux utilisateurs.</p>
            </div>
            <button 
              onClick={() => setConfig({...config, allowSignups: !config.allowSignups})}
              className={`w-14 h-8 rounded-full flex items-center p-1 transition-all ${config.allowSignups ? 'bg-primary' : 'bg-surface-container-high'}`}
            >
              <motion.div 
                layout
                className="w-6 h-6 bg-white rounded-full shadow-sm"
                style={{ x: config.allowSignups ? 24 : 0 }}
              />
            </button>
          </div>
        </div>

        <div>
           <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1">Message d'annonce global</label>
           <input 
             type="text" 
             value={config.announcement}
             onChange={e => setConfig({...config, announcement: e.target.value})}
             placeholder="Message affiché à tous les utilisateurs (vide = désactivé)"
             className="w-full bg-surface-container p-3.5 text-sm rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none"
           />
        </div>
      </div>

      {/* LLM CONFIG */}
      <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-surface-container-low flex flex-col gap-6 mb-8">
        <h3 className="font-display font-extrabold text-lg flex items-center gap-2 mb-2">
          <Key size={20} className="text-primary"/> Configuration IA (LLM)
        </h3>

        <div className="flex items-center justify-between pb-4 border-b border-surface-container-low">
          <div>
            <label className="block text-sm font-bold">Activer l'Analyse IA</label>
            <p className="text-xs text-secondary mt-1">Autoriser l'IA à analyser les dépenses des utilisateurs.</p>
          </div>
          <button 
            onClick={() => setConfig({...config, isEnabled: !config.isEnabled})}
            className={`w-14 h-8 rounded-full flex items-center p-1 transition-all ${config.isEnabled ? 'bg-primary' : 'bg-surface-container-high'}`}
          >
            <motion.div 
              layout
              className="w-6 h-6 bg-white rounded-full shadow-sm"
              style={{ x: config.isEnabled ? 24 : 0 }}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1">Fournisseur</label>
            <select 
              value={config.provider}
              onChange={e => setConfig({...config, provider: e.target.value})}
              className="w-full bg-surface-container p-3.5 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 border-none transition-all"
            >
              <option value="openai">OpenAI (Cloud)</option>
              <option value="anthropic">Anthropic (Cloud)</option>
              <option value="google">Google Gemini (Cloud)</option>
              <option value="openrouter">OpenRouter (Cloud)</option>
              <option value="local">Serveur Local (Ollama, LM Studio)</option>
            </select>
          </div>

          <div>
             <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1">Max Transactions</label>
             <input 
               type="number" 
               value={config.maxTransactions}
               onChange={e => setConfig({...config, maxTransactions: parseInt(e.target.value) || 50})}
               className="w-full bg-surface-container p-3.5 text-sm font-bold rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none font-mono"
             />
          </div>
        </div>

        <div>
           <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1 flex justify-between items-center">
              <span>Base URL (Optionnel)</span>
           </label>
           <input 
             type="text" 
             value={config.url}
             onChange={e => setConfig({...config, url: e.target.value})}
             placeholder="Ex: http://localhost:11434/v1"
             className="w-full bg-surface-container p-3.5 text-sm font-bold rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none font-mono"
           />
           <p className="text-[10px] uppercase font-bold text-secondary/60 mt-2 ml-1">Utile pour Ollama LM Studio ou OpenRouter</p>
        </div>

        <div>
           <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1">Nom du Modèle</label>
           <input 
             type="text" 
             value={config.model}
             onChange={e => setConfig({...config, model: e.target.value})}
             placeholder="gpt-4o-mini, claude-3-haiku, llama3..."
             className="w-full bg-surface-container p-3.5 text-sm font-bold rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none font-mono"
           />
        </div>

        <div>
           <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1 flex items-center gap-1.5">
             <Key size={14} /> Clé API (Cloud)
           </label>
           <input 
             type="password" 
             value={config.apiKey}
             onChange={e => setConfig({...config, apiKey: e.target.value})}
             placeholder="sk-..."
             className="w-full bg-surface-container p-3.5 text-sm font-bold rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none font-mono tracking-widest"
           />
           <p className="text-[10px] uppercase font-bold text-secondary/60 mt-2 ml-1">Automatiquement chiffrée (AES-256) sur le serveur. Laisser vide si inchangée.</p>
        </div>

        <div>
           <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1">System Prompt</label>
           <textarea 
             value={config.systemPrompt}
             onChange={e => setConfig({...config, systemPrompt: e.target.value})}
             placeholder="Tu es un conseiller financier..."
             className="w-full bg-surface-container p-3.5 text-sm text-secondary rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none min-h-[150px] resize-y font-mono"
           />
        </div>

        <div className="flex gap-4 mt-2">
          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-primary text-on-primary font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-all font-display uppercase tracking-widest text-sm shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? 'Sauvegarde...' : 'Sauvegarder globale'}
          </motion.button>
          
          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              if (confirm('Vider le cache IA pour tous les utilisateurs ?')) {
                 const token = await auth.currentUser?.getIdToken();
                 fetch('/api/admin/clear-cache', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                 }).then(res => {
                    if (res.ok) alert('Cache vidé avec succès !');
                    else alert('Erreur lors du nettoyage du cache.');
                 });
              }
            }}
            className="px-6 bg-error/10 text-error font-bold rounded-xl flex items-center justify-center hover:bg-error/20 transition-all uppercase tracking-widest text-sm"
          >
            Vider Cache IA
          </motion.button>
        </div>
      </div>
    </div>
  );
}
