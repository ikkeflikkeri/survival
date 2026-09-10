# survival

A Three.js + Vite scaffold. A WebGL renderer renders a scene with a perspective camera, a rotating cube, and a ground plane, with a `requestAnimationFrame` loop and window resize handling.

## Requirements

- Node.js 18+ (Node 20 LTS recommended)
- npm 9+

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Opens the Vite dev server at http://localhost:5173 by default.

## Build

```bash
npm run build
```

Outputs the production bundle to `dist/`.

## Preview production build

```bash
npm run preview
```

## Project layout

```
.
├── index.html        # Canvas + module entry to src/main.js
├── src/
│   └── main.js       # Three.js scene (renderer, camera, cube, ground, RAF loop, resize)
├── vite.config.js    # Vite config (base: '/')
├── vercel.json       # Vercel build + SPA rewrite config
├── .github/
│   └── workflows/
│       └── ci.yml    # GitHub Actions: npm ci + npm run build on Node 20
├── package.json      # dev / build / preview scripts + three + vite
└── .gitignore
```

## Deployment

The repo is wired for one-click deployment on [Vercel](https://vercel.com). The configuration is file-based and committed to the repository:

- **`vercel.json`** is the single source of truth. It sets `buildCommand` to `npm run build`, `outputDirectory` to `dist`, and `framework` to `vite`, so Vercel builds exactly like `npm run build` does locally.
- A **rewrite** rule sends any request that does **not** look like a static asset (`.js`, `.css`, `.png`, `.svg`, `.ico`, `.json`, `.map`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.mp3`, `.mp4`, `.webm`, `.glb`, `.gltf`, `.hdr`, `.exr`, etc.) to `/index.html`, which is the SPA fallback Vite is built for. Real asset files still resolve from the filesystem because Vercel consults the filesystem **before** applying rewrites.
- **`vite.config.js`** keeps `base: '/'` so Vite emits absolute asset paths (`/assets/index-<hash>.js`) suitable for a root-domain deploy.
- **`.github/workflows/ci.yml`** runs `npm ci` and `npm run build` on Node 20 for every push to `main` and every pull request, so a broken build is caught before it reaches Vercel.

### First-time setup

1. Go to <https://vercel.com/new> and import the GitHub repository (`ikkeflikkeri/survival`).
2. Vercel auto-detects the framework from `vercel.json` (`vite`), the build command (`npm run build`), and the output directory (`dist`). You should not need to change anything on the "Configure Project" screen.
3. Click **Deploy**. The first production build runs against `main` and produces a URL like `survival-<hash>.vercel.app`.

### Ongoing

After the first connect, every push to `main` triggers a production deploy automatically. Every push to any other branch (and every PR) gets a preview deployment with its own URL. No secrets are required — Vercel uses the GitHub App for authentication.
