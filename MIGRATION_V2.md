# DADASH v2 — Migration Live

**Branche** : `v2/main`
**Déploiement cible** : `v2.dadash.co` (preview Vercel)
**Durée totale** : ~4 semaines

## Stack v2

- React 19 · TypeScript 5 strict
- Vite 7 · Tailwind v4 · shadcn/ui
- TanStack Router (file-based, code-split auto) + TanStack Query
- Supabase (même instance `lkrzjwfwhiimpnsyeuxi`, même auth JWT)
- Chart.js 4 (reused from v1 design)

## Phases de migration

### Phase 0 — Setup (cette PR)
- [x] Scaffold `/v2/` (Vite + React 19 + TS5 + Tailwind v4)
- [x] Design tokens portés depuis `PROTO_1_INDIGO_PREMIUM_V2.html`
- [x] Router 13 routes avec role guards
- [x] Layout sidebar + topbar + auth
- [x] Dashboard complet (KPIs, graphe 2 modes, TX table, digest, commissions breakdown)
- [x] 12 stubs pages (à porter en PRs suivantes)
- [x] `vercel.json` pour preview `v2.dadash.co`

### Phase 1 — Shadow staging (5-7 jours)
- [ ] Domaine `v2.dadash.co` → projet Vercel preview
- [ ] Basic auth gate (password uniquement DADA)
- [ ] Port Messagerie complète (5 filtres, thread agrandi, panneau IA)
- [ ] Port Live OPS (tracking + alertes + grille chatters)
- [ ] Port SwissCam Cockpit (cams fleet + tips feed + planning)

### Phase 2 — Gérant (3 jours)
- [ ] Middleware Vercel : `dadash.co` sert v2 pour `user.id === DADA`
- [ ] Bouton "Retour v1" permanent en bas de sidebar
- [ ] Sentry + logs Supabase actifs

### Phase 3 — MC (3 jours)
- [ ] Flip Jacques + Alex (MC) + Jules (MC)
- [ ] Formation MC 30min (boucle Loom)

### Phase 4 — Chatters (3 jours par vague)
- [ ] Vague 1 : 3 volontaires (Alex, Nina, Jules chatters)
- [ ] Vague 2 : reste équipe

### Phase 5 — v1 freeze (30 jours observation)
- [ ] `v1.dadash.co` accessible en read-only
- [ ] `v1-final` tag GitHub
- [ ] Archivage après 30j

## Rollback

À tout moment : changer le `REWRITE_TARGET` dans `vercel.json` de `v2/dist` vers la version v1. Déploiement Vercel = propagation en 30s.

En cas de bug grave :
```bash
vercel rollback dadash-crm --to-deployment=<deployment-id-v1>
```

## Commandes dev

```bash
cd v2
cp .env.example .env.local  # remplir VITE_SUPABASE_ANON_KEY
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run build
npm run preview
```

## Règles permanentes

1. Ne JAMAIS toucher aux fichiers de v1 depuis `/v2/` (index.html racine, assets actuels)
2. Mêmes tables Supabase — pas de schema change dans cette PR
3. Auth JWT partagée : un user connecté sur v1 doit l'être sur v2 sans re-login
4. Bundle initial < 500 KB (vérifié via `npm run build` + report rollup)
5. Lighthouse > 90 mobile avant merge en prod

## Structure

```
/v2/
├── src/
│   ├── components/
│   │   ├── layout/      # Sidebar, Topbar, AppShell
│   │   └── ui/          # Card, Button, Chip, KpiCard, Chart
│   ├── hooks/           # useAuth, useFeatureFlag
│   ├── lib/             # supabase, cn
│   ├── pages/           # 13 pages (DashboardPage full, 12 stubs)
│   ├── routes/          # TanStack Router file-based
│   ├── types/
│   ├── globals.css      # Design tokens Tailwind v4
│   ├── main.tsx
│   └── routeTree.gen.ts # auto-generated
├── index.html
├── package.json
├── tsconfig*.json
├── vite.config.ts
└── .env.example
```

## Prochaines PRs (ordre)

1. **PR #1 — Messagerie complète** (ALFRED · Opus · ~$6)
2. **PR #2 — Live OPS** (ALFRED · Sonnet 4.6 · ~$4)
3. **PR #3 — SwissCam Cockpit** (CAST + ALFRED · Opus · ~$8, dépend audit VPS)
4. **PR #4 — Spenders + Zoo Map** (ALFRED · Sonnet 4.6 · ~$4)
5. **PR #5 — Dadacast + builder audience** (NOVA · Opus · ~$6)
6. **PR #6 — Gestion agence (compta 2-clics + paies + factures)** (ALFRED + EDGAR-SQL · Sonnet · ~$5)
7. **PR #7 — Équipe + Modèles + Providers + Catalogue** (ALFRED · Sonnet · ~$4)
8. **PR #8 — Widget JIM intégré** (NOVA · Opus · ~$5)
