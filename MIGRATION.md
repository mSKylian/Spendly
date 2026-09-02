# Migration — mettre à jour une instance existante

Ce guide s'adresse à quiconque faisait déjà tourner Spendly **avant** la
refonte de la configuration et le moteur de catégories (branches
`fix/server-firestore-credentials` + `category-engine`, sept. 2026). Il est
autoportant : vous pouvez le coller tel quel à un agent (Google AI Studio,
Claude, etc.) qui gère le projet pour vous.

Symptôme typique : **le serveur ne démarre plus** avec
`[Spendly] SERVER_ENCRYPTION_KEY env var is required…`, ou les imports de
relevés échouent avec des erreurs de permissions Firestore.

Les étapes sont ordonnées ; 1 et 2 sont obligatoires pour tout le monde.

---

## 1. Configuration : tout vit dans `.env` (obligatoire)

Le fichier `firebase-applet-config.json` n'existe plus. Toute la configuration
(client **et** serveur) est lue depuis un unique `.env` à la racine.

```bash
cp .env.example .env
```

Puis renseigner :

- `VITE_FIREBASE_*` — la config web de **votre** projet Firebase (console
  Firebase → *Paramètres du projet → Vos applications → Application Web*).
  Ce sont les mêmes valeurs qui vivaient dans `firebase-applet-config.json`.
- `SERVER_ENCRYPTION_KEY` — **obligatoire, le serveur refuse de démarrer sans
  elle**. Générez-la :

  ```bash
  openssl rand -hex 32
  ```

- `GEMINI_API_KEY` — optionnel : clé Gemini de repli quand aucun fournisseur
  IA n'est configuré dans le panneau admin.

## 2. Redéployer les règles Firestore (obligatoire)

Le moteur de catégories a changé le modèle de données : les transactions
portent désormais `categoryId` + `categorySource` (jusqu'à 10 champs), et de
nouvelles collections/champs existent (`merchantRules`, catégories
personnalisées `custom_*`, `completedAt` sur les challenges, fonctionnalités
réservées au tier `pro`).

**Les anciennes règles déployées rejettent ces écritures** — concrètement,
l'import de relevés échoue tant que les règles ne sont pas à jour :

```bash
npx firebase-tools deploy --only firestore:rules --project <votre-project-id>
```

## 3. Identifiants serveur (recommandé)

Les endpoints Express (`/api/analyze`, `/api/scan-receipt`,
`/api/parse-statement`, `/api/admin/*`) utilisent le SDK Admin Firebase et ont
besoin d'identifiants Google. Deux options (détails dans
[docs/DEV_SETUP.md](docs/DEV_SETUP.md)) :

- **ADC** (machine de dev) : `gcloud auth application-default login` puis
  `gcloud auth application-default set-quota-project <votre-project-id>` ;
- **Compte de service** (sandbox, CI, AI Studio) : console Firebase →
  *Paramètres du projet → Comptes de service → Générer une clé privée*, puis
  exporter `GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/la-cle.json`.

Sans identifiants, l'application démarre et fonctionne côté client ; ces
endpoints répondent 503 et le serveur logue un avertissement explicite au
démarrage (« Firestore is UNREACHABLE »).

## 4. Migration des données : catégories (si base existante)

Les transactions et challenges créés avant le moteur de catégories n'ont pas
de `categoryId`. Un script de migration **idempotent** (les documents déjà
migrés sont ignorés, il peut être relancé sans risque) les tamponne à partir
de leur ancien nom de catégorie :

```bash
npx tsx scripts/migrate-categories.ts
```

- Nécessite les identifiants serveur de l'étape 3 (SDK Admin).
- **Base vide ou nouveau projet : inutile** — les nouvelles écritures passent
  par le pipeline de catégorisation.
- Sans migration, l'app reste utilisable : les anciennes catégories sont
  re-mappées à la volée à l'affichage (`slugFromLegacy`), mais la migration
  rend les données cohérentes et accélère les agrégations.

## 5. Optionnel, selon vos besoins

- **Panneau admin** : créer un document `admins/{uid}` dans Firestore pour
  votre utilisateur (sinon `/api/admin/*` répond 403).
- **Tier pro** (recatégorisation manuelle, règles marchands, catégories
  personnalisées) : passer `tier` à `'pro'` sur `users/{uid}` — **écriture
  côté serveur uniquement** (SDK Admin), les règles interdisent au client de
  changer son tier.
- **Fournisseur IA** : configurez-le dans le panneau admin (Gemini, OpenAI,
  Anthropic, OpenRouter, ou serveur local Ollama/LM Studio — les adresses
  locales/privées en HTTP sont acceptées), ou laissez `GEMINI_API_KEY` en
  repli.

## Vérification

```bash
npm run dev
```

Au démarrage, le serveur doit afficher :

```
Server running on http://localhost:3000
[Spendly] Firestore connectivity OK
```

Puis dans l'app : importer un relevé (les transactions arrivent catégorisées),
et vérifier que les pages Accueil/Stats affichent les catégories. Si le
serveur logue « Firestore is UNREACHABLE », reprendre l'étape 3.

---

*Références : [README.md](README.md) (configuration complète),
[docs/DEV_SETUP.md](docs/DEV_SETUP.md) (identifiants serveur),
[docs/CATEGORY_ENGINE.md](docs/CATEGORY_ENGINE.md) et
[docs/DATA_MODEL.md](docs/DATA_MODEL.md) (modèle de données).*
