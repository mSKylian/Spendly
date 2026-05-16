# 💸 Spendly — Le temps d'écran pour ton compte en banque

Spendly est une application mobile et web de gestion financière personnelle qui transforme tes transactions bancaires en insights visuels clairs et actionnables. Comme le temps d'écran sur ton téléphone, Spendly te montre exactement où part ton argent — et te dit comment dépenser mieux.

## ✨ Fonctionnalités principales

- 📊 **Tableau de bord visuel** — Visualise tes dépenses par catégorie avec des barres de progression colorées, comme un temps d'écran pour tes finances
- 🤖 **Conseiller IA personnalisé** — Un moteur d'analyse IA détecte tes habitudes et génère des recommandations concrètes (carte de fidélité, abonnement partagé, alternatives moins chères...)
- 💡 **Page Alternatives** — Découvre combien tu pourrais économiser chaque mois avec des conseils adaptés à tes vrais achats
- 🔗 **Connexion bancaire sécurisée** — Connecte ton compte via IBAN ou PayPal grâce à l'API Nordigen (conforme DSP2)
- 🔒 **Magic Link** — Connexion sans mot de passe via Firebase Authentication
- ⚙️ **Panneau d'administration** — Configure ton fournisseur IA préféré (Gemini, OpenAI, Anthropic, OpenRouter, ou un modèle local via Ollama/LM Studio)

## 🧠 Moteur IA flexible

Spendly supporte plusieurs fournisseurs de LLM :

| Type | Exemples |
|---|---|
| Frontier models | OpenAI, Anthropic, Google Gemini |
| Agrégateurs | OpenRouter |
| Modèles locaux | Ollama, LM Studio |
| Custom | Toute API compatible OpenAI |

Les clés API cloud sont chiffrées en **AES-256** côté serveur. Les modèles locaux sont appelés directement depuis le navigateur — aucune donnée ne quitte ta machine.

## 🛠️ Stack technique

| Composant | Technologie |
|---|---|
| Frontend | React + Vite |
| Mobile | React Native |
| Backend | Node.js + Express |
| Base de données | Firebase Firestore |
| Authentification | Firebase Auth (Magic Link) |
| Connexion bancaire | Nordigen API |
| IA | SDK OpenAI universel (multi-fournisseurs) |
| Hébergement | Vercel |

## 🚀 Lancer le projet en local

```bash
# Cloner le repo
git clone https://github.com/ton-username/spendly.git
cd spendly

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Remplis les valeurs dans .env

# Lancer en développement
npm run dev
```

## 🔑 Variables d'environnement

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
SERVER_ENCRYPTION_KEY=
NORDIGEN_SECRET_ID=
NORDIGEN_SECRET_KEY=
```

## 📱 Captures d'écran

*Coming soon*

## 🗺️ Roadmap

- [x] Design des écrans principaux
- [x] Authentification Firebase (Magic Link)
- [x] Moteur IA multi-fournisseurs
- [x] Panneau d'administration IA
- [ ] Connexion bancaire Nordigen
- [ ] Application mobile React Native
- [ ] Publication App Store & Play Store
- [ ] Plan premium (Stripe)

## 👤 Auteur

Fait avec 🖤 par **Kylian** — [@menacekylian](https://instagram.com/menacekylian)

## 📄 Licence

MIT
