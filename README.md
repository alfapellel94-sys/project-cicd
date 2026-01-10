# Santu Hub - Application de Test CICD 🚀

Application Next.js simple conçue pour tester et valider les pipelines de déploiement continu (CI/CD). Cette application affiche les informations système de l'environnement d'exécution, ce qui permet de vérifier facilement que les déploiements fonctionnent correctement sur différentes plateformes.

## 📋 Fonctionnalités

- **Message de bienvenue** : Interface simple et claire
- **Informations système** : Affichage en temps réel des caractéristiques de l'environnement d'exécution :
  - Système d'exploitation et version
  - Architecture du processeur
  - Modèle du CPU
  - Mémoire totale et disponible
  - Temps d'activité (uptime)
  - Nom de l'hôte

## 🛠️ Stack Technique

- **Framework** : [Next.js](https://nextjs.org) 16.1.1
- **React** : 19.2.3
- **Styling** : Tailwind CSS 4.1.18
- **TypeScript** : Support complet
- **Fonts** : Geist Sans & Geist Mono

## 🚀 Démarrage Rapide

### Prérequis

- Node.js 18.17.0 ou supérieur
- pnpm, npm, yarn ou bun

### Installation

```bash
# Installer les dépendances
pnpm install
# ou
npm install
# ou
yarn install
```

### Développement

```bash
# Lancer le serveur de développement
pnpm dev
# ou
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur pour voir l'application.

### Build de Production

```bash
# Créer une build de production
pnpm build
# ou
npm run build

# Démarrer le serveur de production
pnpm start
# ou
npm start
```

## 🧪 Utilisation pour les Tests CICD

Cette application est idéale pour :

- **Valider les pipelines CI/CD** : Vérifier que le build et le déploiement fonctionnent correctement
- **Tester différents environnements** : Confirmer que l'application s'exécute sur différentes plateformes
- **Surveiller les déploiements** : Les informations système permettent de vérifier l'environnement cible
- **Démonstrations** : Exemple simple pour présenter les capacités de déploiement continu

## 📁 Structure du Projet

```
santu-hub-cicd-example/
├── app/
│   ├── layout.tsx      # Layout principal de l'application
│   ├── page.tsx         # Page d'accueil avec les infos système
│   └── globals.css      # Styles globaux avec Tailwind CSS
├── public/              # Fichiers statiques
├── next.config.ts       # Configuration Next.js
├── postcss.config.mjs   # Configuration PostCSS pour Tailwind
└── package.json         # Dépendances du projet
```

## 🔧 Configuration

L'application utilise Webpack au lieu de Turbopack pour éviter les problèmes de compatibilité avec Tailwind CSS v4. Pour modifier cela, éditez le script `dev` dans `package.json`.

## 📝 Notes

- L'application utilise le module Node.js `os` pour récupérer les informations système
- Les informations sont générées côté serveur (Server Components)
- L'interface supporte le mode sombre automatique

## 🚢 Déploiement

Cette application peut être déployée sur n'importe quelle plateforme supportant Next.js :

- **Vercel** : Déploiement automatique depuis Git
- **Docker** : Containerisation avec accès aux informations de l'hôte
- **Autres plateformes** : Netlify, AWS, Azure, etc.

### Déploiement Docker avec accès aux informations de l'hôte

Pour afficher les informations système de l'hôte (et non du conteneur), il faut monter les volumes suivants :

```bash
# Construire l'image
docker build -t santu-hub-cicd:latest .

# Lancer le conteneur avec les volumes montés
docker run -p 3000:3000 \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -v /etc:/host/etc:ro \
  santu-hub-cicd:latest
```

**Important** : Les volumes `/proc`, `/sys` et `/etc` doivent être montés en lecture seule (`:ro`) pour que l'application puisse lire les informations système de l'hôte plutôt que celles du conteneur.

### Exemple de déploiement Vercel

```bash
vercel
```

## 📄 Licence

Ce projet est un exemple de test et peut être utilisé librement.
