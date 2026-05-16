import { Transaction, CategoryBudget, Challenge, Account } from "../types";
import { auth } from "../firebase";

export async function analyzeSpending(
  transactions: Transaction[],
  categories: CategoryBudget[],
  currentChallenges: Challenge[],
  accounts: Account[]
) {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { insight: "Non connecté", newChallenges: [] };

    // Create a simple hash of transactions to use for caching
    const str = JSON.stringify(transactions.map(t => t.id + t.amount));
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }

    const payload = {
      transactionsHash: hash.toString(),
      transactions: transactions.map(t => ({ name: t.name, amount: t.amount, category: t.category, accountId: t.accountId }))
    };

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      return await res.json();
    }
    
    return {
      insight: "Spend Coach analyse tes habitudes...",
      newChallenges: []
    };
  } catch (error) {
    console.error("Analysis Error:", error);
    return {
      insight: "Spend Coach analyse tes habitudes...",
      newChallenges: []
    };
  }
}
