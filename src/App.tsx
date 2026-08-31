/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Tab } from './types';
import Navigation from './components/Navigation';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Stats from './components/Stats';
import Challenges from './components/Challenges';
import Accounts from './components/Accounts';
import Profile from './components/Profile';
import Login from './components/Login';
import { useSpendlyStore } from './store';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('accueil');
  const store = useSpendlyStore();
  const { user, isLoading, login } = store;

  // Expose store for dev/admin actions (development only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).spendlyStore = store;
    }
  }, [store]);

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

  if (!user) {
    return (
      <Login 
        onLogin={login} 
        onEmailLogin={store.loginWithMagicLink}
        isLoading={isLoading} 
      />
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'accueil': return <Dashboard store={store} />;
      case 'stats': return <Stats store={store} />;
      case 'challenges': return <Challenges store={store} />;
      case 'comptes': return <Accounts store={store} />;
      case 'profil': return <Profile store={store} />;
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
        {/* A single keyed view that re-mounts and fades in on tab change. No
            AnimatePresence exit-wait, which could deadlock the content swap
            when the store re-renders mid-transition. */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          {renderContent()}
        </motion.div>
      </main>

      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

