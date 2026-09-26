/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, useState, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Tab } from './types';
import Navigation from './components/Navigation';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Stats from './components/Stats';
import Challenges from './components/Challenges';
import Accounts from './components/Accounts';
import Profile from './components/Profile';
import AdminPanel from './components/AdminPanel';
import Login from './components/Login';
import { useSpendlyStore } from './store';

class ScreenErrorBoundary extends Component<{
  children: ReactNode;
  onGoHome: () => void;
}, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen render failed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="py-12 text-center" role="alert">
          <h2 className="font-bold text-lg">Cette page n'a pas pu s'afficher.</h2>
          <p className="text-sm text-secondary mt-2">Réessaie ou retourne à l'accueil.</p>
          <button
            className="mt-5 px-4 py-2 rounded-lg bg-primary text-white font-bold"
            onClick={this.props.onGoHome}
          >
            Retour à l'accueil
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('accueil');
  const [runtimeStatus, setRuntimeStatus] = useState<{ maintenanceMode: boolean; announcement: string } | null>(null);
  const [runtimeStatusError, setRuntimeStatusError] = useState('');
  const store = useSpendlyStore();
  const { user, isLoading, login } = store;

  useEffect(() => {
    let active = true;
    fetch('/api/app-status', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Impossible de charger les paramètres de l’application.');
        if (active) setRuntimeStatus({
          maintenanceMode: data.maintenanceMode === true,
          announcement: typeof data.announcement === 'string' ? data.announcement : ''
        });
      })
      .catch((error) => {
        if (active) setRuntimeStatusError(error instanceof Error ? error.message : 'Erreur réseau.');
      });
    return () => { active = false; };
  }, []);

  // Expose store for dev/admin actions (development only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).spendlyStore = store;
    }
  }, [store]);

  useEffect(() => {
    if (user && !isLoading) {
      const urlParams = new URLSearchParams(window.location.search);
      const inviteToken = urlParams.get('invite');
      if (inviteToken) {
        void (async () => {
          try {
            const { auth } = await import('./firebase');
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Session Firebase expirée. Reconnecte-toi puis réessaie.');
            const res = await fetch('/api/admin/accept-invite', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: inviteToken })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Échec de l’acceptation (HTTP ${res.status}).`);
            alert('Félicitations, vous êtes maintenant administrateur !');
            window.history.replaceState({}, document.title, window.location.pathname);
            window.location.reload();
          } catch (error) {
            alert(error instanceof Error ? error.message : 'Impossible de contacter le serveur.');
          }
        })();
      }
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex flex-col items-center justify-center text-white">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center border border-white/20 mb-4"
        >
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </motion.div>
        <p className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-60">Chargement de Spendly...</p>
      </div>
    );
  }

  if (store.loadError) {
    return (
      <main className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center" role="alert">
        <h1 className="font-display font-extrabold text-xl">Données indisponibles</h1>
        <p className="text-sm text-secondary mt-2">{store.loadError}</p>
        <button
          className="mt-5 px-4 py-2 rounded-lg bg-primary text-white font-bold"
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
      </main>
    );
  }

  if (!user) {
    return (
      <Login 
        onLogin={login} 
        onEmailLogin={store.loginWithMagicLink}
        isLoading={isLoading} 
      />
    );
  }

  if (runtimeStatusError && !store.isAdmin) {
    return <main className="min-h-screen flex items-center justify-center p-6 text-center" role="alert">
      <div><h1 className="font-bold text-xl">État de Spendly indisponible</h1><p className="mt-2 text-sm text-secondary">{runtimeStatusError}</p></div>
    </main>;
  }

  if (runtimeStatus?.maintenanceMode && !store.isAdmin) {
    return <main className="min-h-screen flex items-center justify-center p-6 text-center">
      <div><h1 className="font-display font-extrabold text-2xl">Spendly est en maintenance</h1>
        <p className="mt-3 text-secondary">L’accès sera rétabli dès la fin de l’intervention.</p>
        {runtimeStatus.announcement && <p className="mt-5 rounded-xl bg-primary/10 p-4 text-sm">{runtimeStatus.announcement}</p>}
      </div>
    </main>;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'accueil': return <Dashboard store={store} />;
      case 'stats': return <Stats store={store} />;
      case 'challenges': return <Challenges store={store} />;
      case 'comptes': return <Accounts store={store} />;
      case 'profil': return <Profile store={store} />;
      case 'admin': return store.isAdmin
        ? <AdminPanel seedMockData={store.seedMockData} />
        : <div className="py-12 text-center" role="alert">Accès réservé aux administrateurs.</div>;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-secondary">
            <p className="text-sm font-medium">Bientôt disponible</p>
          </div>
        );
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'accueil': return 'Spendly';
      case 'stats': return 'Statistiques';
      case 'challenges': return 'Economies';
      case 'comptes': return 'Mes Comptes';
      case 'profil': return 'Mon Profil';
      case 'admin': return 'Administration';
      default: return 'Spendly';
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <Header 
        title={getPageTitle()} 
        avatar={user?.avatar} 
        onAvatarClick={() => setActiveTab('profil')} 
      />
      
      <main className="pt-20 px-5 max-w-lg mx-auto overflow-x-hidden">
        {runtimeStatus?.announcement && !runtimeStatus.maintenanceMode && (
          <aside className="mb-5 rounded-xl bg-primary/10 p-4 text-sm" role="status">{runtimeStatus.announcement}</aside>
        )}
        {/* A single keyed view that re-mounts and fades in on tab change. No
            AnimatePresence exit-wait, which could deadlock the content swap
            when the store re-renders mid-transition. */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <ScreenErrorBoundary key={activeTab} onGoHome={() => setActiveTab('accueil')}>
            {renderContent()}
          </ScreenErrorBoundary>
        </motion.div>
      </main>

      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={store.isAdmin} />
    </div>
  );
}
