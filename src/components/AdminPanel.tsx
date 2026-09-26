import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Save, AlertCircle, Check, Key, Smartphone, RefreshCcw, Loader2, Copy, Search, Trash2, Users } from 'lucide-react';
import { auth } from '../firebase';

type AdminOverview = {
  users: number;
  admins: number;
  pendingInvites: number;
  checkedAt: string;
};

type AdminUser = { id: string; name: string; email: string; tier: 'free' | 'pro' };
type AdminInvite = { id: string; createdAt: string; expiresAt?: string; createdBy: string };

async function adminHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Session Firebase expirée. Reconnecte-toi.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({}));
  if (response.status === 503) {
    return data.error || 'Firestore indisponible. Configure les identifiants Google Admin sur le serveur.';
  }
  if (response.status === 401) return 'Session expirée. Reconnecte-toi.';
  if (response.status === 403) return 'Ce compte n’a pas les droits administrateur.';
  return data.error || fallback;
}

export default function AdminPanel({ seedMockData }: { seedMockData?: () => Promise<void> }) {
  const [config, setConfig] = useState<any>({
    isEnabled: true,
    provider: 'openai',
    url: '',
    model: 'gpt-4o-mini',
    apiKey: '',
    maxTransactions: 50,
    maintenanceMode: false,
    announcement: '',
    systemPrompt: "Tu es un conseiller financier expert. Tu vas recevoir une liste de transactions au format JSON. Identifie 2 à 3 recommandations spécifiques pour que l'utilisateur puisse faire des économies directes sur ses dépenses récurrentes ou superflues.\n\nRenvoie UNIQUEMENT un objet JSON avec la clé 'recommendations' contenant un tableau d'objets. Chaque objet doit avoir cette structure EXACTE :\n- \"title\" (titre court)\n- \"subtitle\" (nom du marchand ou sous-titre)\n- \"description\" (explication de l'économie)\n- \"potentialSaving\" (nombre en euros)\n- \"category\" (nom de catégorie courte, ex: \"Abonnement\")\n- \"status\": \"available\"\n- \"level\": 1, 2 ou 3 selon la difficulté."
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [isDenied, setIsDenied] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [revokingInvite, setRevokingInvite] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [usersCursor, setUsersCursor] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');
  const [clearingCache, setClearingCache] = useState(false);

  const handleCreateInvite = async () => {
    setInviteLoading(true);
    setInviteError('');
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: await adminHeaders()
      });
      if (!res.ok) throw new Error(await responseError(res, 'Échec de création de l’invitation.'));
      const data = await res.json();
      setInviteToken(`${window.location.origin}?invite=${data.token}`);
      setInviteExpiresAt(data.expiresAt || '');
      setMessage({ type: 'success', text: 'Invitation créée. Elle expirera dans 7 jours.' });
      await Promise.all([fetchInvites(), fetchOverview()]);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Erreur réseau.');
    } finally {
      setInviteLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchOverview();
    fetchInvites();
    fetchUsers();
  }, []);

  const fetchInvites = async () => {
    setInvitesLoading(true);
    try {
      const res = await fetch('/api/admin/invites', { headers: await adminHeaders() });
      if (!res.ok) throw new Error(await responseError(res, 'Impossible de charger les invitations.'));
      const data = await res.json();
      setInvites(data.invites || []);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Erreur réseau.');
    } finally {
      setInvitesLoading(false);
    }
  };

  const revokeInvite = async (token: string) => {
    setRevokingInvite(token);
    setInviteError('');
    try {
      const res = await fetch(`/api/admin/invites/${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: await adminHeaders()
      });
      if (!res.ok) throw new Error(await responseError(res, 'Impossible de révoquer cette invitation.'));
      setInvites((current) => current.filter((invite) => invite.id !== token));
      setMessage({ type: 'success', text: 'Invitation révoquée.' });
      await fetchOverview();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Erreur réseau.');
    } finally {
      setRevokingInvite('');
    }
  };

  const fetchUsers = async (cursor?: string, append = false) => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/admin/users?${params}`, { headers: await adminHeaders() });
      if (!res.ok) throw new Error(await responseError(res, 'Impossible de charger les utilisateurs.'));
      const data = await res.json();
      setUsers((current) => append ? [...current, ...(data.users || [])] : (data.users || []));
      setUsersCursor(data.nextCursor || null);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Erreur réseau.');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteToken);
      setMessage({ type: 'success', text: 'Lien d’invitation copié.' });
    } catch {
      setMessage({ type: 'error', text: 'Copie impossible. Sélectionne le lien pour le copier.' });
    }
  };

  const fetchOverview = async () => {
    setOverviewLoading(true);
    setOverviewError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) setIsDenied(true);
        throw new Error(data.error || 'Impossible de charger les indicateurs.');
      }
      setOverview(await res.json());
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : 'Erreur réseau.');
    } finally {
      setOverviewLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      
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
        setMessage({ type: 'error', text: await responseError(res, 'Erreur lors du chargement de la configuration.') });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
        setMessage({ type: 'error', text: await responseError(res, 'Erreur lors de la sauvegarde.') });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Erreur réseau.' });
    } finally {
      setSaving(false);
    }
  };

  const fetchModels = async () => {
     setLoadingModels(true);
     setModelError('');
     try {
       const token = await auth.currentUser?.getIdToken();
       const res = await fetch('/api/admin/models', {
         method: 'POST',
         headers: { 
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
            provider: config.provider,
            url: config.url,
            apiKey: config.apiKey
         })
       });
       if (res.ok) {
          const data = await res.json();
          setAvailableModels(data.models || []);
       } else {
          const err = await res.json();
          setModelError(err.error || 'Erreur lors de la récupération');
       }
     } catch (e) {
       setModelError('Erreur réseau');
     } finally {
       setLoadingModels(false);
     }
  };

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center gap-3 text-secondary" role="status">
        <Loader2 size={24} className="animate-spin" />
        <p className="text-sm">Chargement de l'administration...</p>
      </div>
    );
  }

  if (isDenied) {
    return (
      <div className="py-12 text-center" role="alert">
        <h2 className="font-bold text-lg">Accès administrateur refusé</h2>
        <p className="text-sm text-secondary mt-2">Ce compte n'est pas autorisé à consulter cette page.</p>
      </div>
    );
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

      <section className="mb-8" aria-labelledby="admin-overview-title">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 id="admin-overview-title" className="font-display font-extrabold text-lg">Vue d'ensemble</h3>
          <button
            type="button"
            onClick={fetchOverview}
            disabled={overviewLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-container text-sm font-bold text-secondary disabled:opacity-50"
          >
            <RefreshCcw size={15} className={overviewLoading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
        {overviewError ? (
          <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm" role="alert">
            {overviewError}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Utilisateurs', value: overview?.users },
              { label: 'Administrateurs', value: overview?.admins },
              { label: 'Invitations en attente', value: overview?.pendingInvites }
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-container-lowest border border-surface-container-low rounded-xl p-4">
                <p className="text-xs font-bold uppercase text-secondary">{label}</p>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">
                  {overviewLoading && !overview ? '—' : value ?? '—'}
                </p>
              </div>
            ))}
          </div>
        )}
        {overview?.checkedAt && !overviewError && (
          <p className="mt-2 text-xs text-secondary">Mis à jour à {new Date(overview.checkedAt).toLocaleTimeString('fr-FR')}</p>
        )}
      </section>

      <section className="mb-8" aria-labelledby="admin-users-title">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 id="admin-users-title" className="font-display font-extrabold text-lg flex items-center gap-2">
              <Users size={19} /> Utilisateurs
            </h3>
            <p className="text-xs text-secondary mt-1">Recherche et parcours paginé des profils.</p>
          </div>
          <button
            type="button"
            onClick={() => fetchUsers()}
            disabled={usersLoading}
            aria-label="Actualiser les utilisateurs"
            className="p-2 rounded-lg border border-surface-container text-secondary disabled:opacity-50"
          >
            <RefreshCcw size={16} className={usersLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary/50" />
          <input
            type="search"
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Nom, email ou identifiant"
            className="w-full bg-surface-container p-3 pl-10 text-sm rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none"
          />
        </div>
        {usersError ? (
          <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm" role="alert">{usersError}</div>
        ) : (
          <div className="divide-y divide-surface-container border-y border-surface-container">
            {users.filter((user) => `${user.name} ${user.email} ${user.id}`.toLowerCase().includes(userSearch.trim().toLowerCase())).map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{user.name || 'Sans nom'}</p>
                  <p className="text-xs text-secondary truncate">{user.email || user.id}</p>
                </div>
                <span className="shrink-0 text-[10px] font-extrabold uppercase px-2 py-1 rounded-md bg-surface-container text-secondary">
                  {user.tier}
                </span>
              </div>
            ))}
            {!usersLoading && users.length === 0 && (
              <p className="py-6 text-center text-sm text-secondary">Aucun profil trouvé.</p>
            )}
            {!usersLoading && users.length > 0 && !users.some((user) => `${user.name} ${user.email} ${user.id}`.toLowerCase().includes(userSearch.trim().toLowerCase())) && (
              <p className="py-6 text-center text-sm text-secondary">Aucun résultat pour cette recherche.</p>
            )}
          </div>
        )}
        {usersCursor && (
          <button
            type="button"
            onClick={() => fetchUsers(usersCursor, true)}
            disabled={usersLoading}
            className="mt-3 w-full py-3 rounded-lg border border-surface-container text-sm font-bold text-primary disabled:opacity-50"
          >
            {usersLoading ? 'Chargement...' : 'Charger 25 profils supplémentaires'}
          </button>
        )}
      </section>

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

          <div className="flex items-center pb-4 border-b border-surface-container-low">
            <p className="text-xs text-secondary">Contrôle des inscriptions indisponible : Firebase Auth doit être configuré avec une fonction de blocage côté plateforme.</p>
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
           <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1 flex items-center justify-between">
             <span className="flex items-center gap-1.5"><Key size={14} /> Clé API (Cloud)</span>
             <button 
               onClick={fetchModels} 
               disabled={loadingModels}
               className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
             >
                {loadingModels ? <Loader2 className="animate-spin" size={14}/> : <RefreshCcw size={14}/>}
                Tester & Lister les modèles
             </button>
           </label>
           <input 
             type="password" 
             value={config.apiKey}
             onChange={e => setConfig({...config, apiKey: e.target.value})}
             placeholder={config.hasApiKey ? 'Clé enregistrée (laisser vide pour la conserver)' : 'sk-...'}
             className="w-full bg-surface-container p-3.5 text-sm font-bold rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none font-mono tracking-widest"
           />
           <p className="text-[10px] uppercase font-bold text-secondary/60 mt-2 ml-1">Automatiquement chiffrée (AES-256) sur le serveur. Laisser vide si inchangée.</p>
        </div>

        <div>
           <label className="block text-xs uppercase font-bold text-secondary mb-2 ml-1 flex justify-between items-center">
             <span>Nom du Modèle</span>
           </label>
           <input 
             type="text" 
             list="model-list"
             value={config.model}
             onChange={e => setConfig({...config, model: e.target.value})}
             placeholder="gpt-4o-mini, claude-3-haiku, llama3..."
             className="w-full bg-surface-container p-3.5 text-sm font-bold rounded-xl outline-none focus:ring-2 focus:ring-primary/20 border-none font-mono"
           />
           {availableModels.length > 0 && (
             <datalist id="model-list">
               {availableModels.map(m => <option key={m} value={m} />)}
             </datalist>
           )}
           {modelError && (
             <p className="text-[10px] uppercase font-bold text-error mt-2 ml-1">{modelError}</p>
           )}
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
              if (!confirm('Vider le cache IA pour tous les utilisateurs ?')) return;
              setClearingCache(true);
              setMessage(null);
              try {
                const res = await fetch('/api/admin/clear-cache', { method: 'POST', headers: await adminHeaders() });
                if (!res.ok) throw new Error(await responseError(res, 'Échec du nettoyage du cache.'));
                const data = await res.json();
                setMessage({ type: 'success', text: `Cache IA vidé. ${data.processedUsers} profils traités.` });
              } catch (e) {
                setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Erreur réseau.' });
              } finally {
                setClearingCache(false);
              }
            }}
            disabled={clearingCache}
            className="px-6 bg-error/10 text-error font-bold rounded-xl flex items-center justify-center hover:bg-error/20 transition-all uppercase tracking-widest text-sm disabled:opacity-50"
          >
            {clearingCache ? 'Nettoyage...' : 'Vider Cache IA'}
          </motion.button>
        </div>

        <div className="mt-8 pt-8 border-t border-surface-container-low">
          <h4 className="text-xs uppercase font-extrabold text-secondary mb-4 tracking-widest">Inviter un administrateur</h4>
          <p className="text-xs text-secondary mb-4">Crée un lien d'invitation unique pour donner les droits d'administration à un nouvel utilisateur.</p>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleCreateInvite}
            disabled={inviteLoading}
            className="w-full py-4 bg-primary text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0px_8px_16px_rgba(20,93,255,0.2)] mb-4 disabled:opacity-50"
          >
            {inviteLoading ? 'Création...' : 'Générer un lien'}
          </motion.button>
          {inviteError && <p className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm" role="alert">{inviteError}</p>}
          
          {inviteToken && (
            <div className="p-4 bg-primary/10 rounded-xl mb-4 border border-primary/20">
              <p className="text-[10px] font-extrabold text-primary mb-2 uppercase tracking-widest">
                Invitation à usage unique{inviteExpiresAt ? ` · expire le ${new Date(inviteExpiresAt).toLocaleString('fr-FR')}` : ''}
              </p>
              <input 
                type="text" 
                readOnly 
                value={inviteToken} 
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="w-full text-xs p-3 rounded-lg bg-white border border-primary/20 text-secondary focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={handleCopyInvite}
                className="mt-3 flex items-center gap-2 text-sm font-bold text-primary"
              >
                <Copy size={16} /> Copier le lien
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-6 mb-3">
            <h4 className="text-xs uppercase font-extrabold text-secondary tracking-widest">Invitations actives</h4>
            <button type="button" onClick={fetchInvites} disabled={invitesLoading} className="text-xs font-bold text-primary disabled:opacity-50">
              {invitesLoading ? 'Actualisation...' : 'Actualiser'}
            </button>
          </div>
          {invitesLoading && invites.length === 0 ? (
            <p className="py-4 text-sm text-secondary">Chargement des invitations...</p>
          ) : invites.length === 0 ? (
            <p className="py-4 text-sm text-secondary">Aucune invitation active.</p>
          ) : (
            <div className="divide-y divide-surface-container border-y border-surface-container">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">Créée le {new Date(invite.createdAt).toLocaleDateString('fr-FR')}</p>
                    <p className="text-xs text-secondary">
                      {invite.expiresAt ? `Expire le ${new Date(invite.expiresAt).toLocaleDateString('fr-FR')}` : 'Sans expiration'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      title="Copier le lien d'invitation"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(`${window.location.origin}?invite=${encodeURIComponent(invite.id)}`);
                          setMessage({ type: 'success', text: 'Lien d’invitation copié.' });
                        } catch {
                          setMessage({ type: 'error', text: 'Copie impossible depuis ce navigateur.' });
                        }
                      }}
                      className="p-2 rounded-lg text-primary hover:bg-primary/10"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      type="button"
                      title="Révoquer l'invitation"
                      onClick={() => revokeInvite(invite.id)}
                      disabled={revokingInvite === invite.id}
                      className="p-2 rounded-lg text-error hover:bg-error/10 disabled:opacity-50"
                    >
                      {revokingInvite === invite.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 pt-8 border-t border-surface-container-low">
          <h4 className="text-xs uppercase font-extrabold text-secondary mb-4 tracking-widest">Actions de Développement</h4>
          <motion.button 
            whileTap={{ scale: 0.98 }}
            onClick={async () => {
              if (confirm('Voulez-vous injecter des données de démonstration ? (Cela nettoiera vos transactions actuelles)')) {
                if (seedMockData) {
                   await seedMockData();
                   alert('Données injectées avec succès ! L\'IA va analyser ton nouveau profil.');
                }
              }
            }}
            className="w-full py-4 bg-secondary/10 text-secondary rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-secondary/20 transition-all border border-secondary/20"
          >
            Générer Mock Data
          </motion.button>
        </div>
      </div>
    </div>
  );
}
