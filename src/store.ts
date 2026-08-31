import { useState, useMemo, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  runTransaction,
  writeBatch,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { Transaction, CategoryBudget, Challenge, Account, UserProfile } from './types';
import { analyzeSpending } from './services/geminiService';

export type SpendlyStore = {
  balance: number;
  user: UserProfile | null;
  accounts: Account[];
  categories: CategoryBudget[];
  transactions: Transaction[];
  challenges: Challenge[];
  totalAssets: number;
  isLoading: boolean;
  isAiAnalyzing: boolean;
  activateChallenge: (id: string) => Promise<void>;
  addTransaction: (t: Omit<Transaction, 'id'>) => Promise<void>;
  addAccount: (a: Omit<Account, 'id'>) => Promise<string | void>;
  deleteAccount: (id: string) => Promise<void>;
  updateUser: (user: Partial<UserProfile>) => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loginWithMagicLink: (email: string) => Promise<void>;
  seedMockData: () => Promise<void>;
  scanReceipt: (base64Image: string) => Promise<any>;
  executeAiAnalysis: () => Promise<void>;
};

const DEFAULT_CATEGORIES: Omit<CategoryBudget, 'id'>[] = [
  { name: 'Nourriture', spent: 0, limit: 400, colorClass: 'bg-orange-500', iconName: 'utensils' },
  { name: 'Loisirs', spent: 0, limit: 300, colorClass: 'bg-purple-500', iconName: 'zap' },
  { name: 'Transport', spent: 0, limit: 200, colorClass: 'bg-blue-500', iconName: 'car' },
  { name: 'Abos', spent: 0, limit: 50, colorClass: 'bg-teal-500', iconName: 'play' },
];

const DEFAULT_ACCOUNTS: Omit<Account, 'id'>[] = [
  { name: 'Compte Courant', bankName: 'Banque Principale', balance: 0, type: 'current', iconName: 'bank', colorClass: 'bg-blue-500' },
];

const DEFAULT_CHALLENGES: Omit<Challenge, 'id'>[] = [
  {
    title: 'Optimisation Cora',
    subtitle: 'Passer à la Carte Cora',
    description: "Tu fais souvent tes courses au Cora. Active ta carte de fidélité pour cumuler des points et économiser sur tes prochains passages.",
    potentialSaving: 15,
    status: 'available',
    category: 'Courses',
    level: 1,
    progress: 0,
    isAiGenerated: true
  },
  {
    title: 'Défi Alternative Lidl',
    subtitle: 'Courses malines',
    description: "En faisant une partie des tes courses hebdo chez Lidl au lieu de Cora, tu pourrais réduire ta facture de 20%.",
    potentialSaving: 40,
    status: 'available',
    category: 'Courses',
    level: 2,
    isAiGenerated: true
  }
];

export function useSpendlyStore(): SpendlyStore {
  const [balance, setBalance] = useState(0);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<CategoryBudget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      if (!u) {
        setIsLoading(false);
        setUser(null);
        setBalance(0);
        setAccounts([]);
        setCategories([]);
        setTransactions([]);
        setChallenges([]);
      }
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!fbUser) return;

    setIsLoading(true);
    const userId = fbUser.uid;

    const unsubProfile = onSnapshot(doc(db, 'users', userId), async (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        setUser(data);
        setBalance(data.balance);
      } else {
        // Initialize new user
        const newProfile: UserProfile = {
          name: fbUser.displayName || 'Utilisateur',
          email: fbUser.email || '',
          avatar: fbUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${fbUser.uid}`,
          balance: 1000,
          insight: 'Bienvenue sur Spendly ! Ton budget est prêt.',
          tier: 'free',
          limits: { week: 400, month: 1600, year: 19200 }
        };
        try {
          await setDoc(doc(db, 'users', userId), newProfile);
          
          // Seed initial data
          const batch = writeBatch(db);
          DEFAULT_CATEGORIES.forEach(c => batch.set(doc(collection(db, 'users', userId, 'categories')), c));
          DEFAULT_ACCOUNTS.forEach(a => batch.set(doc(collection(db, 'users', userId, 'accounts')), a));
          DEFAULT_CHALLENGES.forEach(ch => batch.set(doc(collection(db, 'users', userId, 'challenges')), ch));
          await batch.commit();
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${userId}`);
        }
      }
      setIsLoading(false);
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${userId}`));

    const unsubTransactions = onSnapshot(collection(db, 'users', userId, 'transactions'), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      setTransactions(docs.sort((a, b) => b.date.localeCompare(a.date)));
    });

    const unsubCategories = onSnapshot(collection(db, 'users', userId, 'categories'), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as CategoryBudget)));
    });

    const unsubAccounts = onSnapshot(collection(db, 'users', userId, 'accounts'), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
    });

    const unsubChallenges = onSnapshot(collection(db, 'users', userId, 'challenges'), (snap) => {
      setChallenges(snap.docs.map(d => ({ id: d.id, ...d.data() } as Challenge)));
    });

    return () => {
      unsubProfile();
      unsubTransactions();
      unsubCategories();
      unsubAccounts();
      unsubChallenges();
    };
  }, [fbUser]);

  const executeAiAnalysis = async () => {
    if (!fbUser || isAiAnalyzing || transactions.length === 0) return;
    
    setIsAiAnalyzing(true);
    try {
      const result = await analyzeSpending(transactions, categories, challenges, accounts);
      if (result) {
        const userId = fbUser.uid;
        const updates: any = {};
        if (result.insight) updates.insight = result.insight;
        
        await updateDoc(doc(db, 'users', userId), updates);

        if (result.newChallenges && result.newChallenges.length > 0) {
          const batch = writeBatch(db);
          result.newChallenges.forEach((nc: any) => {
            // Only add if doesn't exist by title check (simple)
            if (!challenges.some(c => c.title === nc.title)) {
              const challengeData = {
                ...nc,
                status: 'available',
                isAiGenerated: true
              };

              // If targetAccountId is provided by AI, try to find the bank name
              if (nc.targetAccountId) {
                const targetAcc = accounts.find(a => a.id === nc.targetAccountId);
                if (targetAcc) {
                  challengeData.targetBankName = targetAcc.bankName;
                }
              }

              batch.set(doc(collection(db, 'users', userId, 'challenges')), challengeData);
            }
          });
          await batch.commit();
        }
      }
    } catch (e) {
      console.error('AI Analysis failed', e);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // Trigger AI analysis when data changes substantially or on initial load
  useEffect(() => {
    if (!fbUser || transactions.length === 0) return;
    
    // Trigger on load
    executeAiAnalysis();

    const timeout = setTimeout(() => {
      executeAiAnalysis();
    }, 5000); // Also trigger after changes to transactions/categories

    return () => clearTimeout(timeout);
  }, [transactions.length, categories.length, fbUser?.uid]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error('Login error:', e);
      throw e;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const loginWithMagicLink = async (email: string) => {
    setIsLoading(true);
    try {
      const actionCodeSettings = {
        url: window.location.origin, // Redirect back to the same page
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.sessionStorage.setItem('emailForSignIn', email);
    } catch (e) {
      console.error('Magic link error:', e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const seedMockData = async () => {
    if (!fbUser) return;
    setIsLoading(true);
    try {
      const userId = fbUser.uid;
      const batch = writeBatch(db);

      // 1. Clear existing transactions (optional but cleaner)
      const currentTx = await getDocs(collection(db, 'users', userId, 'transactions'));
      currentTx.forEach(d => batch.delete(d.ref));

      // 2. Add realistic transactions
      const mockSales = [
        { name: 'Cora Supermarché', amount: -145.20, category: 'Nourriture', iconName: 'shopping-cart' },
        { name: 'Starbucks Coffee', amount: -12.50, category: 'Loisirs', iconName: 'coffee' },
        { name: 'Uber Trip', amount: -22.00, category: 'Transport', iconName: 'car' },
        { name: 'Cora Drive', amount: -89.40, category: 'Nourriture', iconName: 'shopping-cart' },
        { name: 'Netflix', amount: -15.99, category: 'Abos', iconName: 'play' },
        { name: 'Spotify', amount: -9.99, category: 'Abos', iconName: 'music' },
        { name: 'Apple.com', amount: -2.99, category: 'Abos', iconName: 'cloud' },
        { name: 'Cora Cafétéria', amount: -18.50, category: 'Nourriture', iconName: 'utensils' },
        { name: 'Lidl', amount: -42.10, category: 'Nourriture', iconName: 'shopping-bag' },
        { name: 'Amazon Support', amount: -49.00, category: 'Loisirs', iconName: 'package' }
      ];

      const accId = accounts[0]?.id;
      mockSales.forEach((s, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const transRef = doc(collection(db, 'users', userId, 'transactions'));
        batch.set(transRef, {
          ...s,
          accountId: accId,
          date: date.toISOString(),
          status: 'completed'
        });
      });

      await batch.commit();
      // Analysis will trigger automatically via useEffect
    } catch (e) {
      console.error('Seeding error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const scanReceipt = async (base64Image: string) => {
    if (!fbUser) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: base64Image })
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error('Scanning failed');
    } catch (error) {
      console.error("Scan Error:", error);
      throw error;
    }
  };

  useEffect(() => {
    // Check if returning from a magic link
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.sessionStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Veuillez entrer votre email pour confirmer :');
      }
      if (email) {
        setIsLoading(true);
        signInWithEmailLink(auth, email, window.location.href)
          .then((result) => {
            window.sessionStorage.removeItem('emailForSignIn');
            // Remove the firebase params from the URL so it doesn't trigger again
            window.history.replaceState(null, '', window.location.pathname);
          })
          .catch((error) => console.error(error))
          .finally(() => setIsLoading(false));
      }
    }
  }, []);


  const updateUser = async (updatedUser: Partial<UserProfile>) => {
    if (!fbUser) return;
    const path = `users/${fbUser.uid}`;
    try {
      await updateDoc(doc(db, path), updatedUser);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  };

  const addAccount = async (a: Omit<Account, 'id'>) => {
    if (!fbUser) return;
    const path = `users/${fbUser.uid}/accounts`;
    try {
      const docRef = await addDoc(collection(db, path), a);
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  };

  const deleteAccount = async (id: string) => {
    if (!fbUser) return;
    const accountPath = `users/${fbUser.uid}/accounts/${id}`;
    try {
      const q = query(collection(db, 'users', fbUser.uid, 'transactions'), where('accountId', '==', id));
      const querySnapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', fbUser.uid, 'accounts', id));
      
      querySnapshot.forEach((docSnapshot) => {
        batch.delete(docSnapshot.ref);
      });
      
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, accountPath);
    }
  };

  const activateChallenge = async (id: string) => {
    if (!fbUser) return;
    const challenge = challenges.find(c => c.id === id);
    if (!challenge) return;

    const path = `users/${fbUser.uid}/challenges/${id}`;
    try {
      if (challenge.status === 'available') {
        await updateDoc(doc(db, path), { status: 'in_progress' });
      } else if (challenge.status === 'in_progress') {
        const userPath = `users/${fbUser.uid}`;
        await runTransaction(db, async (tx) => {
          const userSnap = await tx.get(doc(db, userPath));
          if (!userSnap.exists()) throw new Error('User not found');
          const currentBalance = userSnap.data().balance;
          tx.update(doc(db, userPath), { balance: currentBalance + challenge.potentialSaving });
          tx.update(doc(db, path), { status: 'completed', progress: 100 });
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  };

  const addTransaction = async (t: Omit<Transaction, 'id'>) => {
    if (!fbUser) return;
    const userId = fbUser.uid;
    try {
      await runTransaction(db, async (tx) => {
        // --- READS ---
        const userRef = doc(db, 'users', userId);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('User not found');
        
        let accountRef = null;
        let accountSnap = null;
        if (t.accountId) {
          accountRef = doc(db, 'users', userId, 'accounts', t.accountId);
          accountSnap = await tx.get(accountRef);
        }

        // --- WRITES ---
        tx.update(userRef, { balance: userSnap.data().balance + t.amount });

        const transRef = doc(collection(db, 'users', userId, 'transactions'));
        tx.set(transRef, t);

        if (accountRef && accountSnap && accountSnap.exists()) {
          tx.update(accountRef, { balance: accountSnap.data().balance + t.amount });
        }

        const cat = categories.find(c => c.name.toLowerCase() === t.category.toLowerCase());
        if (cat) {
          tx.update(doc(db, 'users', userId, 'categories', cat.id!), { 
            spent: cat.spent + Math.abs(t.amount) 
          });
        }
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${userId}/transactions`);
    }
  };

  const totalAssets = useMemo(() => accounts.reduce((acc, curr) => acc + curr.balance, 0), [accounts]);

  return {
    balance,
    user,
    accounts,
    categories,
    transactions,
    challenges,
    totalAssets,
    isLoading,
    isAiAnalyzing,
    activateChallenge,
    addTransaction,
    addAccount,
    deleteAccount,
    updateUser,
    login,
    logout,
    loginWithMagicLink,
    seedMockData,
    scanReceipt,
    executeAiAnalysis
  };
}

