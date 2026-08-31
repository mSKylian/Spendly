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
git clone https://github.com/mSKylian/Spendly.git
cd Spendly

# Installer les dépendances
npm install

# Configurer Firebase (client) — ce fichier n'est PAS versionné
cp firebase-applet-config.example.json firebase-applet-config.json
# Remplis les valeurs depuis la console Firebase :
# Paramètres du projet > Vos applications > Application Web > Configuration

# Configurer les variables d'environnement du serveur
cp .env.example .env
# Génère une clé de chiffrement et renseigne-la dans .env (voir ci-dessous)

# Lancer en développement
npm run dev
```

Le serveur démarre sur `http://localhost:3000` (client Vite + API Express).

## 🔥 Configuration Firebase

La config Firebase du client vit dans `firebase-applet-config.json` (à la racine).
Ce fichier est **ignoré par Git** — copie `firebase-applet-config.example.json` et
renseigne les valeurs de ton projet. Dans la console Firebase, active aussi :

- **Authentication** → fournisseurs *Google* et *E-mail/Lien e-mail (sans mot de passe)*
- **Firestore** → base de données, puis publie les règles depuis `firestore.rules`

> Les clés d'une config Firebase Web sont publiques par nature ; la sécurité repose
> sur les règles Firestore (`firestore.rules`), pas sur le secret de ces clés.

## 🔑 Variables d'environnement (serveur)

Renseignées dans `.env` (voir `.env.example`) :

| Variable | Requis | Description |
|---|---|---|
| `SERVER_ENCRYPTION_KEY` | ✅ | Chiffre au repos la clé API LLM de l'admin. **≥ 64 caractères hex** — le serveur refuse de démarrer sinon. Génère-la avec `openssl rand -hex 32`. |
| `GEMINI_API_KEY` | ⚪️ | Clé Gemini utilisée en repli quand aucun fournisseur n'est configuré dans le panneau admin. |
| `APP_URL` | ⚪️ | URL publique de l'applet (liens auto-référencés). Par défaut `http://localhost:3000`. |

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
