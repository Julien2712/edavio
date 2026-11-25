# Edavio

**Documents made simple.** An open source, privacy-first desktop app for editing documents. Everything runs locally; your files never leave your device.

> Status: early development. The app shell and the tool registry are ready; the PDF editor is the next phase.

## Quick start

```bash
npm install
npm run dev      # opens the Edavio desktop window (hot reload)
```

Other commands:

```bash
npm run dev:web  # run in a browser only (http://127.0.0.1:5173)
npm run start    # build then launch the app like a production run
npm run dist     # package an installer into ./release (Windows .exe, macOS .dmg, Linux AppImage)
```

Requires Node.js 20+.

## Stack

- Electron (desktop shell)
- Vite + React 19 + TypeScript (strict)
- Tailwind CSS v4, Radix UI primitives
- React Router, i18next (FR / EN)
- Planned for the PDF editor: pdfjs-dist (rendering), pdf-lib (export), Konva (editing layer), Tesseract.js (OCR), Zustand (state)

## Architecture

Every tool is an independent module that implements `ToolModule` (`src/core/tools/types.ts`) and is registered in the central `ToolRegistry`.

```text
electron/             Electron main process + preload
src/
├── core/
│   ├── tools/        ToolModule interface + ToolRegistry
│   └── i18n/         i18next setup and locale files
├── components/       shell, layout, UI primitives
├── pages/            home, not found
└── tools/
    ├── pdf/          PDF editor (first tool)
    └── future.ts     placeholders: documents, spreadsheets, presentations
```

To add a tool: create its module, then register it in `src/tools/index.ts`. Routes, navigation and the home page update automatically.

To add a language: create `src/core/i18n/locales/<code>.json` and add it to `SUPPORTED_LANGUAGES` in `src/core/i18n/index.ts`.

## Privacy

All processing happens locally in the browser. There is no backend, no account and no upload.

## License

MIT, see [LICENSE](LICENSE).
