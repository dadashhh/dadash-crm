# Rollback / Pin production à un commit spécifique

Pour forcer la production à servir exactement la version affichée sur Safari (ex: commit `d95fa9ed`) :

1. **Vercel Dashboard** → Projet → Deployments
2. Trouver le déploiement correspondant au commit souhaité (ex: `d95fa9ed`)
3. Cliquer sur les 3 points → **Promote to Production**

Ou via CLI :
```bash
vercel promote <deployment-url> --scope=production
```

## Build injection

À chaque déploiement, le script `scripts/inject-build-id.js` :
- Injecte `VERCEL_GIT_COMMIT_SHA` dans `index.html` (__buildId)
- Injecte le même hash dans `sw.js` (CACHE_NAME = dadash-{sha})

→ Chaque déploiement invalide le cache SW. Chrome et Safari affichent la même version.

## Si un utilisateur voit une version divergente

Cliquer sur le BUILD_ID dans la sidebar (sous la version) → déclenche `__hardRefresh` (purge cache + unregister SW + reload).
