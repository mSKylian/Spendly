import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import 'dotenv/config';
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import OpenAI from "openai";

// Initialize Firebase Admin
let db: FirebaseFirestore.Firestore;
try {
  const accountConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
  const app = initializeApp({ projectId: accountConfig.projectId });
  db = getFirestore(app, accountConfig.firestoreDatabaseId);
} catch (e) {
  console.error("Failed to initialize Firebase Admin", e);
}

const ENCRYPTION_KEY = process.env.SERVER_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Middleware to authenticate
  const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
      const decoded = await getAuth().verifyIdToken(token);
      (req as any).user = decoded;
      next();
    } catch (e) {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };

  const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    // Verify admin
    try {
      const adminDoc = await db.collection('admins').doc(user.uid).get();
      if (!adminDoc.exists) {
        return res.status(403).json({ error: 'Forbidden: Admins only' });
      }
      next();
    } catch (e) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  app.post("/api/admin/bootstrap", authenticate, async (req, res) => {
    const user = (req as any).user;
    const ADMIN_EMAILS = ['kylian.allaoui@gmail.com', 'admin@spendly.com', 'kylian.allaoui@icloud.com', 'allaoui.zouhair@gmail.com'];
    if (ADMIN_EMAILS.includes(user.email)) {
      try {
        await db.collection('admins').doc(user.uid).set({ role: 'admin' });
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: 'Failed to bootstrap admin' });
      }
    } else {
      res.status(403).json({ error: 'Not eligible for admin bootstrap' });
    }
  });

  // API Routes
  app.get("/api/admin/config", authenticate, verifyAdmin, async (req, res) => {
    try {
      const doc = await db.collection('admin').doc('llm_config').get();
      if (!doc.exists) {
        return res.json({});
      }
      const data = doc.data() as any;
      if (data.apiKey) {
        try {
           data.apiKey = decrypt(data.apiKey);
        } catch(e) {
           data.apiKey = ''; // Ignore decrypt error if key rotated
        }
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch config' });
    }
  });

  app.post("/api/admin/clear-cache", authenticate, verifyAdmin, async (req, res) => {
    try {
      const usersSnapshot = await db.collection('users').get();
      const batch = db.batch();
      let count = 0;
      for (const doc of usersSnapshot.docs) {
        const cacheDocRef = db.collection('users').doc(doc.id).collection('cache').doc('recommendations');
        batch.delete(cacheDocRef);
        count++;
      }
      if (count > 0) {
        await batch.commit();
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });

  app.post("/api/admin/config", authenticate, verifyAdmin, async (req, res) => {
    try {
      const { provider, url, model, apiKey, systemPrompt, isEnabled, maxTransactions, maintenanceMode, allowSignups, announcement } = req.body;
      const dataToSave: any = { 
        provider, 
        url, 
        model, 
        systemPrompt, 
        isEnabled: isEnabled !== false, 
        maxTransactions: maxTransactions || 50,
        maintenanceMode: !!maintenanceMode,
        allowSignups: allowSignups !== false,
        announcement: announcement || '',
        updatedAt: new Date().toISOString() 
      };
      if (apiKey && apiKey.trim() !== '') {
         dataToSave.apiKey = encrypt(apiKey);
      }
      await db.collection('admin').doc('llm_config').set(dataToSave, { merge: true });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  app.post("/api/analyze", authenticate, async (req, res) => {
    const user = (req as any).user;
    let { transactionsHash, transactions } = req.body;
    
    try {
      // 2. Fetch config
      const doc = await db.collection('admin').doc('llm_config').get();
      const config = doc.exists ? doc.data() : null;

      if (config && config.isEnabled === false) {
        return res.json({ insight: "L'analyse IA est actuellement désactivée par l'administrateur.", newChallenges: [] });
      }
      
      const maxTx = config?.maxTransactions || 50;
      if (transactions.length > maxTx) {
        transactions = transactions.slice(0, maxTx);
      }
      
      // 1. Check cache cache
      const cacheDoc = await db.collection('users').doc(user.uid).collection('cache').doc('recommendations').get();
      if (cacheDoc.exists) {
         const data = cacheDoc.data()!;
         if (data.hash === transactionsHash && data.promptVersion === (config?.updatedAt || 'v1')) {
            return res.json({ insight: data.insight, newChallenges: data.newChallenges });
         }
      }

      let apiKey = '';
      if (config?.apiKey) {
        try { apiKey = decrypt(config.apiKey); } catch(e) {}
      }

      const systemPrompt = config?.systemPrompt || "Tu es un conseiller financier. Renvoie UNIQUEMENT un JSON contenant: 'insight' (string, un résumé court et percutant) et 'newChallenges' (array d'objets avec title, subtitle, description, potentialSaving(number), category, level(number 1-3)).";
      const provider = (config?.provider || 'openai').toLowerCase();
      let baseURL = config?.url || undefined;
      const model = config?.model || 'gpt-4o-mini';

      if (provider === 'google' && !baseURL) {
         baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
      }

      let insight = "Analyse terminée";
      let newChallenges = [];

      try {
        const openai = new OpenAI({
          apiKey: apiKey || 'dummy-key-for-local',
          baseURL: baseURL
        });

        const response = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(transactions) }
          ],
          response_format: { type: 'json_object' }
        });
        
        try {
           const parsed = JSON.parse(response.choices[0].message.content || '{}');
           insight = parsed.insight || "Nouvelle analyse";
           newChallenges = parsed.newChallenges || parsed.recommendations || [];
        } catch(e) {
           console.error("Failed to parse LLM response", e);
        }
      } catch (err) {
        console.error("LLM Provider error:", err);
        return res.status(502).json({ error: 'Failed to contact LLM provider' });
      }

      if (newChallenges.length > 0) {
        await db.collection('users').doc(user.uid).collection('cache').doc('recommendations').set({
           hash: transactionsHash,
           insight,
           newChallenges,
           promptVersion: config?.updatedAt || 'v1',
           analyzedAt: new Date().toISOString()
        });
      }

      res.json({ insight, newChallenges });
    } catch (e) {
       console.error("Analysis error", e);
       res.status(500).json({ error: 'Analysis failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
