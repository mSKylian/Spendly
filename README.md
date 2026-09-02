# 💸 Spendly — Le temps d'écran pour ton compte en banque

Spendly est une application mobile et web de gestion financière personnelle qui transforme tes transactions bancaires en insights visuels clairs et actionnables. Comme le temps d'écran sur ton téléphone, Spendly te montre exactement où part ton argent — et te dit comment dépenser mieux.

## ✨ Fonctionnalités principales

- 📊 **Tableau de bord visuel** — Visualise tes dépenses par catégorie avec des barres de progression colorées, comme un temps d'écran pour tes finances
- 🤖 **Conseiller IA personnalisé** — Un moteur d'analyse IA détecte tes habitudes et génère des recommandations concrètes (carte de fidélité, abonnement partagé, alternatives moins chères...)
- 💡 **Page Alternatives** — Découvre combien tu pourrais économiser chaque mois avec des conseils adaptés à tes vrais achats
- 🔗 **Comptes bancaires** — Lie un compte de trois façons : *Connecter* (Compte Courant, PayPal, Livret A, Crypto), *Importer un relevé* (CSV, OFX, QIF, PDF ou photo — formats structurés analysés localement, PDF/images via l'IA), ou *Manuel* (solde d'ouverture). Clique un compte pour voir ses transactions et y importer un relevé. Les soldes proviennent des relevés — l'argent vient toujours de tes comptes réels (voir [docs/DATA_MODEL.md](docs/DATA_MODEL.md)). Exemples dans [`examples/statements/`](examples/statements/).
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

> **Vous faisiez déjà tourner Spendly ?** La configuration et le modèle de
> données ont changé (`.env` unique, moteur de catégories, nouvelles règles
> Firestore). Suivez **[MIGRATION.md](MIGRATION.md)** pour mettre à jour votre
> instance — le guide est autoportant et peut être confié tel quel à un agent
> (Google AI Studio, Claude, …).

```bash
# Cloner le repo
git clone https://github.com/mSKylian/Spendly.git
cd Spendly

# Installer les dépendances
npm install

# Configurer l'environnement (Firebase + serveur) — voir ci-dessous
cp .env.example .env
# Renseigne les valeurs dans .env

# Lancer en développement
npm run dev
```

Le serveur démarre sur `http://localhost:3000` (client Vite + API Express).

Toute la configuration — Firebase **et** serveur — vit désormais dans un seul
fichier `.env` (voir `.env.example`). Il n'y a plus de fichier
`firebase-applet-config.json` séparé.

## 🔥 Configuration Firebase

### Option A — Script automatisé (nouveaux déploiements)

```bash
# Provisionne un projet, déploie les règles et génère le .env
./scripts/setup-firebase.sh <project-id> --create
```

Le script (basé sur `firebase-tools`) crée le projet, enregistre l'app Web,
crée la base Firestore, déploie `firestore.rules` et écrit ton `.env`. Il reste
**une étape manuelle** (non exposée par la CLI Firebase) : dans la console,
**Authentication → Sign-in method**, active *Google* et *E-mail/Lien e-mail
(sans mot de passe)*.

### Option B — Manuelle

Récupère les valeurs dans la console Firebase (*Paramètres du projet > Vos
applications > Application Web > Configuration*) et renseigne les variables
`VITE_FIREBASE_*` de ton `.env`. Puis, dans la console :

- **Authentication** → active *Google* et *E-mail/Lien e-mail (sans mot de passe)*
- **Firestore** → crée la base, puis déploie les règles :

```bash
npx firebase-tools deploy --only firestore:rules --project <project-id>
```

> Les clés d'une config Firebase Web sont publiques par nature ; la sécurité repose
> sur les règles Firestore (`firestore.rules`), pas sur le secret de ces clés.

## 🔑 Variables d'environnement

Toutes renseignées dans `.env` (voir `.env.example`) :

| Variable | Requis | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | ✅ | Clé API Firebase Web (publique). |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | Domaine d'authentification (`<projet>.firebaseapp.com`). |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | ID du projet Firebase (utilisé aussi côté serveur par l'Admin SDK). |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ | Bucket de stockage. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Sender ID Cloud Messaging. |
| `VITE_FIREBASE_APP_ID` | ✅ | ID de l'application Web. |
| `VITE_FIREBASE_DATABASE_ID` | ⚪️ | Base Firestore nommée. Vide = base `(default)`. |
| `VITE_FIREBASE_MEASUREMENT_ID` | ⚪️ | ID Google Analytics (optionnel). |
| `SERVER_ENCRYPTION_KEY` | ✅ | Chiffre au repos la clé API LLM de l'admin. **≥ 64 caractères hex** — le serveur refuse de démarrer sinon. Génère-la avec `openssl rand -hex 32`. |
| `GEMINI_API_KEY` | ⚪️ | Clé Gemini utilisée en repli quand aucun fournisseur n'est configuré dans le panneau admin. |
| `APP_URL` | ⚪️ | URL publique de l'applet (liens auto-référencés). Par défaut `http://localhost:3000`. |

> Les variables `VITE_FIREBASE_*` sont lues à la fois par le client (`import.meta.env`)
> et par le serveur Express (`process.env`), à partir du même `.env`.

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
