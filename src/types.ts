export type Tab = 'accueil' | 'stats' | 'comptes' | 'challenges' | 'profil';

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  // Note: no `balance`. The wallet balance is derived from accounts (see lib/finance).
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
  amount: number; // < 0 debit (expense), > 0 credit (income)
  category: string;
  iconName: string;
  accountId?: string; // owning account; required for all new writes
  status?: 'completed' | 'pending' | 'failed';
  rawLabel?: string; // original statement description, for traceability
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
  balance: number; // current balance (closing balance at import, then tx-adjusted)
  bankName: string;
  type: 'current' | 'paypal' | 'livret_a' | 'crypto';
  iconName: 'bank' | 'wallet' | 'bitcoin' | 'card';
  colorClass: string;
  currency?: string; // ISO 4217, default 'EUR'
  openingBalance?: number; // balance before imported transactions
  ibanLast4?: string; // last 4 of the account number, for display only
  source?: 'manual' | 'import';
}

// Normalized output of parsing any supported bank-statement format.
export interface ParsedStatement {
  account: {
    name: string;
    bankName: string;
    currency: string;
    ibanLast4?: string;
    openingBalance?: number;
    closingBalance: number;
  };
  transactions: Array<{
    date: string; // ISO 8601
    label: string;
    amount: number; // signed: < 0 debit, > 0 credit
    category?: string;
  }>;
}
