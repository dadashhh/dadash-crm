# DADASH v2

> CRM premium agence de modèles en ligne · marché Suisse + SaaS futur

## Quick start

```bash
npm install
cp .env.example .env.local
# Remplir VITE_SUPABASE_ANON_KEY dans .env.local
npm run dev
```

Ouvrir http://localhost:5173

## Stack

- **React 19** · **TypeScript 5** strict
- **Vite 7** · **Tailwind v4** · **shadcn/ui**
- **TanStack Router** + **TanStack Query**
- **Supabase** (`lkrzjwfwhiimpnsyeuxi`)
- **Chart.js 4**

## Scripts

- `npm run dev` — serveur dev avec HMR
- `npm run build` — build prod (tsc check + vite build)
- `npm run typecheck` — juste le check TypeScript
- `npm run preview` — preview le build prod localement
- `npm run lint` — eslint

## Structure

Voir [MIGRATION_V2.md](../MIGRATION_V2.md) à la racine.

## Design system

Toutes les vars CSS sont dans `src/globals.css` (reprises du prototype `PROTO_1_INDIGO_PREMIUM_V2.html`).

Palette indigo `#818cf8` + layer premium (gradient métallique + glass morphism + noise texture).

## Déploiement

Vercel · preview automatique sur chaque push · `v2.dadash.co` pointé sur branche `v2/main`.
