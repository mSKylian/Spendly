import { motion } from 'motion/react';
import { Home, BarChart2, Wallet, Trophy, User } from 'lucide-react';
import { Tab } from '../types';

interface NavigationProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export default function Navigation({ activeTab, setActiveTab }: NavigationProps) {
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'accueil', label: 'Accueil', icon: Home },
    { id: 'stats', label: 'Stats', icon: BarChart2 },
    { id: 'comptes', label: 'Comptes', icon: Wallet },
    { id: 'challenges', label: 'Economies', icon: Trophy },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 bg-surface-container-lowest border-t border-surface-container flex justify-around items-center h-20 pb-safe shadow-[0px_-4px_20px_rgba(0,0,0,0.04)] rounded-t-2xl">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`flex flex-col items-center justify-center relative px-4 py-2 transition-all active:scale-95 ${
            activeTab === id ? 'text-primary font-bold' : 'text-secondary'
          }`}
        >
          <Icon size={24} strokeWidth={activeTab === id ? 2.5 : 2} />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">{label}</span>
          {activeTab === id && (
            <motion.div
              layoutId="nav-dot"
              className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full"
            />
          )}
        </button>
      ))}
    </nav>
  );
}
