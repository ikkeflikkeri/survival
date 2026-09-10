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
├── vite.config.js    # Vite config
├── package.json      # dev / build / preview scripts + three + vite
└── .gitignore
```
