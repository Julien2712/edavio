# Edavio

**Les documents, enfin simples.** Une application de bureau open source, respectueuse de la vie privée, pour éditer vos documents. Tout s'exécute en local — vos fichiers ne quittent jamais votre appareil.

> **Statut :** développement actif. Le éditeur PDF est opérationnel. Les outils Documents, Tableurs et Présentations sont en cours de développement.

---

## Démarrage rapide

**Prérequis :** Node.js 20+

```bash
npm install
npm run dev        # lance l'application Electron (hot reload)
```

### Autres commandes

| Commande | Description |
|---|---|
| `npm run dev:web` | Lance en mode navigateur uniquement (`http://127.0.0.1:5173`) |
| `npm run start` | Build puis lance l'app en mode production |
| `npm run dist` | Génère un installeur dans `./release` (`.exe` Windows, `.dmg` macOS, `.AppImage` Linux) |
| `npm run lint` | Vérifie le code avec oxlint |

---

## Stack technique

| Couche | Technologie |
|---|---|
| Shell bureau | Electron |
| UI | Vite + React 19 + TypeScript (strict) |
| Style | Tailwind CSS v4 + Radix UI |
| Routing | React Router v7 |
| Internationalisation | i18next (FR / EN) |
| État | Zustand |
| PDF | pdfjs-dist (rendu) · pdf-lib (export) |

---

## Architecture

Chaque outil est un module indépendant qui implémente l'interface `ToolModule` (`src/core/tools/types.ts`) et s'enregistre dans le `ToolRegistry` central.

```text
electron/             Process principal Electron + preload
src/
├── core/
│   ├── tools/        Interface ToolModule + ToolRegistry
│   └── i18n/         Configuration i18next + fichiers de traduction
├── components/       Shell, layout, composants UI
├── pages/            Accueil, page 404
└── tools/
    ├── pdf/          Éditeur PDF (outil actif)
    └── future.ts     Placeholders : documents, tableurs, présentations
```

### Ajouter un outil

1. Créer le module de l'outil en implémentant `ToolModule`
2. L'enregistrer dans `src/tools/index.ts`

Les routes, la navigation et la page d'accueil se mettent à jour automatiquement.

### Ajouter une langue

1. Créer `src/core/i18n/locales/<code>.json`
2. L'ajouter à `SUPPORTED_LANGUAGES` dans `src/core/i18n/index.ts`

---

## Outils disponibles

| Outil | Statut |
|---|---|
| 📄 Éditeur PDF | ✅ Disponible |
| 📝 Éditeur de documents | 🔜 Bientôt disponible |
| 📊 Tableur | 🔜 Bientôt disponible |
| 📽️ Présentation | 🔜 Bientôt disponible |

---

## Vie privée

Tout le traitement s'effectue localement dans votre navigateur. Il n'y a aucun serveur, aucun compte, aucun envoi de données.

---

## Licence

MIT — voir [LICENSE](LICENSE).
