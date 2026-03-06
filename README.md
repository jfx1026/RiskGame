# Risk Game

A hexagonal strategy game inspired by the classic Risk board game. Built with TypeScript and SVG rendering.

## Features

- Turn-based strategy gameplay with 4-6 teams
- Three map sizes: Small (18 territories), Medium (38 territories), Large (58 territories)
- AI opponents with distinct personalities
- Dice-based combat system with visual animations
- Responsive design for desktop and mobile

## Development

### Prerequisites

- Node.js 18+

### Setup

```bash
npm install
```

### Run locally

```bash
npm run dev
```

This starts a development server with hot reload at `http://localhost:5173`.

### Type checking

```bash
npm run typecheck
```

### Run tests

```bash
npm test          # Watch mode
npm run test:run  # Single run
```

## Production Build

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder:
- Minified JavaScript (~15 KB gzipped)
- Extracted and minified CSS
- All assets bundled

### Preview production build

```bash
npm run preview
```

## Deployment

The `dist/` folder contains static files that can be deployed to any static hosting service:

### Netlify

1. Connect your repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`

### Vercel

1. Import your repository to Vercel
2. Framework preset: Vite
3. Vercel auto-detects settings from `vite.config.ts`

### GitHub Pages

1. Build the project: `npm run build`
2. Push the `dist/` folder to `gh-pages` branch, or
3. Use GitHub Actions to automate deployment

### Manual / Other hosts

Upload the contents of `dist/` to any static file server (Apache, Nginx, S3, etc.).

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

Requires ES2020 support (async/await, optional chaining, nullish coalescing).

## Project Structure

```
├── src/
│   ├── main.ts          # Entry point, game loop
│   ├── game.ts          # Game state management
│   ├── combat.ts        # Dice combat system
│   ├── ai.ts            # AI decision logic
│   ├── renderer.ts      # SVG rendering
│   ├── mapGenerator.ts  # Procedural map generation
│   ├── hex.ts           # Hexagonal grid math
│   ├── territory.ts     # Territory data structures
│   └── design-tokens.css
├── public/
│   └── assets/          # Static assets (dice sprites)
├── index.html
├── vite.config.ts
└── package.json
```

## License

ISC
