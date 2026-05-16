export type Tab = 'accueil' | 'stats' | 'comptes' | 'challenges' | 'profil';

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  balance: number;
  insight?: string;
  tier: 'free' | 'pro';
  limits: {
    week: number;
    month: number;
    year: number;
  };
}

export interface Transaction {
  id: string;
  name: string;
  date: string;
  amount: number;
  category: string;
  iconName: string;
  accountId?: string;
}

export interface CategoryBudget {
  id?: string;
  name: string;
  spent: number;
  limit: number;
  colorClass: string;
  iconName: string;
}

export interface Challenge {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  potentialSaving: number;
  status: 'available' | 'in_progress' | 'completed';
  category: string;
  level: number;
  progress?: number;
  isAiGenerated?: boolean;
  targetAccountId?: string;
  targetBankName?: string;
}

export interface Account {
  id: string;
  name: string;
  balance: number;
  bankName: string;
  type: 'current' | 'paypal' | 'livret_a' | 'crypto';
  iconName: 'bank' | 'wallet' | 'bitcoin' | 'card';
  colorClass: string;
}
