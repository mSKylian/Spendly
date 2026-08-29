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

  app.post("/api/scan-receipt", authenticate, async (req, res) => {
    const user = (req as any).user;
    const { image } = req.body; // base64 image
    
    if (!image) return res.status(400).json({ error: 'No image provided' });

    try {
      const docConfig = await db.collection('admin').doc('llm_config').get();
      const config = docConfig.exists ? docConfig.data() : null;
      let apiKey = '';
      if (config?.apiKey) {
        try { apiKey = decrypt(config.apiKey); } catch(e) {}
      } else {
        apiKey = process.env.GEMINI_API_KEY || '';
      }

      if (!apiKey) return res.status(500).json({ error: 'API Key not configured' });

      const openai = new OpenAI({
         apiKey: apiKey,
         baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      });

      const response = await openai.chat.completions.create({
        model: 'gemini-1.5-flash',
        messages: [
          {
            role: 'system',
            content: `Tu es un expert en analyse de tickets de caisse. 
            Analyse cette image et extrais :
            1. Le marchand (title)
            2. La date (format ISO)
            3. Le montant total (total - number)
            4. Une liste d'articles (items - array d'objets avec name et price)
            5. Analyse de réduction : Trouve 2-3 produits spécifiques dans le ticket qu'on peut acheter moins cher ailleurs (ex: marque distributeur ou concurrent) ou dont la consommation peut être réduite. 
            
            Renvoie UNIQUEMENT un JSON :
            {
              "merchant": "string",
              "date": "string",
              "total": number,
              "items": [{ "name": "string", "price": number }],
              "analysis": "string (un résumé court des économies possibles)",
              "suggestedChallenges": [{ "title": "string", "description": "string", "potentialSaving": number, "category": "string" }]
            }`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyse ce ticket de caisse.' },
              { type: 'image_url', image_url: { url: image } }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Update challenges in Firestore for the user if suggested
      if (result.suggestedChallenges?.length > 0) {
        const batch = db.batch();
        const challengesCol = db.collection('users').doc(user.uid).collection('challenges');
        
        for (const ch of result.suggestedChallenges) {
           const newDoc = challengesCol.doc();
           batch.set(newDoc, {
             ...ch,
             status: 'available',
             level: 1,
             isAiGenerated: true,
             progress: 0,
             createdAt: new Date().toISOString()
           });
        }
        await batch.commit();
      }

      res.json(result);
    } catch (e) {
      console.error("Scanning Error:", e);
      res.status(500).json({ error: 'Failed to scan receipt' });
    }
  });

  app.post("/api/admin/models", authenticate, verifyAdmin, async (req, res) => {
    try {
      const { provider, url, apiKey } = req.body;
      
      let actualApiKey = apiKey;
      if (!actualApiKey || actualApiKey.includes('•') || actualApiKey === '') {
          const doc = await db.collection('admin').doc('llm_config').get();
          if (doc.exists && doc.data()?.apiKey) {
              try {
                  actualApiKey = decrypt(doc.data()!.apiKey);
              } catch (e) {}
          }
      }

      if (!actualApiKey) {
         return res.status(400).json({ error: "Veuillez fournir une clé API valide." });
      }

      if (provider === 'google' && (!url || url.includes('generativelanguage'))) {
         const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${actualApiKey}`);
         const data = await response.json();
         if (!response.ok) {
            return res.status(400).json({ error: data.error?.message || "Clé API Google invalide." });
         }
         const models = data.models.map((m: any) => m.name.replace('models/', ''));
         return res.json({ models });
      }
      
      if (provider === 'anthropic' && !url) {
         const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
               'x-api-key': actualApiKey,
               'anthropic-version': '2023-06-01',
               'content-type': 'application/json'
            },
            body: JSON.stringify({
               model: 'claude-3-haiku-20240307',
               max_tokens: 1,
               messages: [{role: 'user', content: 'Test'}]
            })
         });
         const data = await response.json();
         if (!response.ok) {
            return res.status(400).json({ error: data.error?.message || "Clé API Anthropic invalide." });
         }
         return res.json({ models: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'] });
      }

      const openai = new OpenAI({
         apiKey: actualApiKey,
         baseURL: url || undefined
      });

      const response = await openai.models.list();
      const models = response.data.map(m => m.id);
      res.json({ models });
    } catch (e: any) {
      console.error("Failed to fetch models", e);
      let errorMessage = e.message || 'Erreur de vérification.';
      if (e.status === 401) errorMessage = "Clé API invalide ou non autorisée.";
      else if (e.status === 404) errorMessage = "L'endpoint de ce fournisseur est introuvable.";
      res.status(400).json({ error: errorMessage });
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
