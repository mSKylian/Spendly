// One-time migration: stamp categoryId/categorySource on existing transactions
// and categoryId on challenges, mapped from their legacy free-string category
// (docs/CATEGORY_ENGINE.md). Idempotent — docs that already carry a categoryId
// are skipped. Run with: npx tsx scripts/migrate-categories.ts
import 'dotenv/config';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { slugFromLegacy } from '../src/lib/taxonomy';

async function main() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('VITE_FIREBASE_PROJECT_ID is not set');
  const db = getFirestore(initializeApp({ projectId }));

  const users = await db.collection('users').get();
  let txUpdated = 0, chUpdated = 0;

  for (const user of users.docs) {
    const [txs, challenges] = await Promise.all([
      user.ref.collection('transactions').get(),
      user.ref.collection('challenges').get(),
    ]);

    let batch = db.batch();
    let ops = 0;
    const commitIfFull = async () => {
      if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
    };

    for (const doc of txs.docs) {
      const d = doc.data();
      if (d.categoryId) continue;
      batch.update(doc.ref, {
        categoryId: d.amount > 0 ? 'revenus' : slugFromLegacy(d.category),
        categorySource: 'default',
      });
      ops++; txUpdated++;
      await commitIfFull();
    }

    for (const doc of challenges.docs) {
      const d = doc.data();
      if (d.categoryId) continue;
      batch.update(doc.ref, { categoryId: slugFromLegacy(d.category) });
      ops++; chUpdated++;
      await commitIfFull();
    }

    if (ops > 0) await batch.commit();
    console.log(`user ${user.id}: done`);
  }

  console.log(`Migrated ${txUpdated} transactions, ${chUpdated} challenges across ${users.size} users.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
