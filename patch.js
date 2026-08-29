const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldRoute = `  app.post("/api/admin/models", authenticate, verifyAdmin, async (req, res) => {
    try {
      const { provider, url, apiKey } = req.body;
      
      let actualApiKey = apiKey;
      // If no new key is provided, try to use the saved one
      if (!actualApiKey || actualApiKey.includes('•') || actualApiKey === '') {
          const doc = await db.collection('admin').doc('llm_config').get();
          if (doc.exists && doc.data()?.apiKey) {
              try {
                  actualApiKey = decrypt(doc.data()!.apiKey);
              } catch (e) {
                  // ignore
              }
          }
      }

      let baseURL = url;
      if (provider === 'google' && !baseURL) {
         baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
      }

      const openai = new OpenAI({
         apiKey: actualApiKey || 'dummy-key-for-local',
         baseURL: baseURL || undefined
      });

      const response = await openai.models.list();
      const models = response.data.map(m => m.id);
      res.json({ models });
    } catch (e: any) {
      console.error("Failed to fetch models", e);
      res.status(500).json({ error: e.message || 'Failed to list models' });
    }
  });`;

const newRoute = `  app.post("/api/admin/models", authenticate, verifyAdmin, async (req, res) => {
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
         const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models?key=\${actualApiKey}\`);
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
  });`;

code = code.replace(oldRoute, newRoute);
fs.writeFileSync('server.ts', code);
console.log("Patched server.ts successfully");
