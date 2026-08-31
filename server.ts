import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import 'dotenv/config';
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import OpenAI from "openai";
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';


// Initialize Firebase Admin from environment variables (see .env.example)
let db: FirebaseFirestore.Firestore;
try {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID is not set');
  }
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID;
  const app = initializeApp({ projectId });
  db = databaseId && databaseId !== '(default)'
    ? getFirestore(app, databaseId)
    : getFirestore(app);
} catch (e) {
  console.error("Failed to initialize Firebase Admin", e);
}

const SERVER_ENCRYPTION_KEY_ENV = process.env.SERVER_ENCRYPTION_KEY;
if (!SERVER_ENCRYPTION_KEY_ENV || SERVER_ENCRYPTION_KEY_ENV.length < 64) {
  throw new Error('[Spendly] SERVER_ENCRYPTION_KEY env var is required and must be at least 64 hex characters. Set it before starting the server.');
}
const ENCRYPTION_KEY = SERVER_ENCRYPTION_KEY_ENV;
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

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // apis.google.com + gstatic: gapi loader used by Firebase Auth signInWithPopup
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", 'https://apis.google.com', 'https://www.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://api.dicebear.com', 'https://lh3.googleusercontent.com', 'https://*.googleusercontent.com'],
        connectSrc: [
          "'self'", 
          'ws:', 
          'wss:', 
          'http://localhost:*',
          'https://*.googleapis.com', 
          'https://*.firebaseapp.com', 
          'https://*.firebaseio.com', 
          'https://api.openai.com', 
          'https://api.anthropic.com', 
          'https://openrouter.ai'
        ],
        frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
        objectSrc: ["'none'"],
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false, // Required for Firebase Auth popup
    crossOriginResourcePolicy: false, // Required for Safari ESM module loading
  }));

  // Rate limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
  });

  const llmLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests. Please wait before retrying.' }
  });

  app.use('/api/', generalLimiter);

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

  app.post("/api/scan-receipt", authenticate, llmLimiter, async (req, res) => {
    const user = (req as any).user;
    const { image } = req.body; // base64 image
    
    if (!image) return res.status(400).json({ error: 'No image provided' });
    // Validate image is a proper base64 data URI with an accepted MIME type
    const validDataUriPattern = /^data:image\/(jpeg|png|webp|gif);base64,/;
    if (!validDataUriPattern.test(image)) {
      return res.status(400).json({ error: 'Invalid image format. Must be a base64 data URI (jpeg, png, webp, or gif).' });
    }
    const base64Data = image.split(',')[1] || '';
    const imageSizeBytes = Buffer.from(base64Data, 'base64').length;
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
    if (imageSizeBytes > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: 'Image is too large. Maximum size is 5 MB.' });
    }

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

      const ALLOWED_BASE_URL_HOSTS_M = [
        'generativelanguage.googleapis.com',
        'api.openai.com',
        'api.anthropic.com',
        'openrouter.ai',
        'localhost',
        '127.0.0.1',
      ];
      let validatedUrl: string | undefined = undefined;
      if (url) {
        try {
          const parsedUrl = new URL(url);
          if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
            return res.status(400).json({ error: 'Custom URL must use HTTPS.' });
          }
          if (!ALLOWED_BASE_URL_HOSTS_M.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h))) {
            return res.status(400).json({ error: `URL host is not in the allowlist.` });
          }
          validatedUrl = url;
        } catch (e) {
          return res.status(400).json({ error: 'Invalid URL format.' });
        }
      }
      const openai = new OpenAI({
         apiKey: actualApiKey,
         baseURL: validatedUrl || undefined
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

  app.post("/api/analyze", authenticate, llmLimiter, async (req, res) => {
    const user = (req as any).user;
    let { transactions } = req.body;
    // Compute hash server-side from the actual submitted data
    const hashStr = JSON.stringify((transactions || []).map((t: any) => `${t.name}:${t.amount}`));
    let hashVal = 0;
    for (let i = 0; i < hashStr.length; i++) {
      hashVal = (hashVal << 5) - hashVal + hashStr.charCodeAt(i);
      hashVal |= 0;
    }
    const transactionsHash = hashVal.toString();
    
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
      const ALLOWED_BASE_URL_HOSTS = [
        'generativelanguage.googleapis.com',
        'api.openai.com',
        'api.anthropic.com',
        'openrouter.ai',
        'localhost',
        '127.0.0.1',
      ];
      let rawBaseURL = config?.url || undefined;
      let baseURL: string | undefined = undefined;
      if (rawBaseURL) {
        try {
          const parsedURL = new URL(rawBaseURL);
          if (parsedURL.protocol !== 'https:' && parsedURL.hostname !== 'localhost' && parsedURL.hostname !== '127.0.0.1') {
            throw new Error('baseURL must use HTTPS');
          }
          if (!ALLOWED_BASE_URL_HOSTS.some(h => parsedURL.hostname === h || parsedURL.hostname.endsWith('.' + h))) {
            throw new Error(`baseURL host '${parsedURL.hostname}' is not in the allowlist`);
          }
          baseURL = rawBaseURL;
        } catch (urlError: any) {
          console.warn('Invalid or disallowed baseURL in config:', urlError.message);
          baseURL = undefined;
        }
      }
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
