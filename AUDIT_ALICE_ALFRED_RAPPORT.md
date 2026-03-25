# AUDIT INTÉGRATION ALICE — RAPPORT ALFRED

**Date** : 2026-03-25
**Branche** : `claude/audit-alice-integration-SuOIr`
**Statut** : CORRECTIONS APPLIQUÉES

---

## ÉTAPE 1 — TABLE MODELS

Alice doit être présente dans la table `models` de Supabase (créée via DADASH, pas directement en base).
- La table `models` est requêtée dynamiquement : `sb.from("models").select("*")`
- Le CRM charge les modèles au démarrage et les propage via props `models` à tous les composants
- Si Alice est dans la table, elle sera visible partout où le code est dynamique

**Vérification Supabase** : non réalisable en CLI (pas d'accès direct à la DB). Vérifié structurellement dans le code.

---

## ÉTAPE 2 — HARDCODES IDENTIFIÉS ET CORRIGÉS

### Constat initial : les helpers dynamiques promis N'EXISTAIENT PAS

Les fonctions `getDynModelEmoji`, `getDynModelColor`, `getDynModelGradient`, `getDynModelCover`, `getDynModelBadge`, `getDynModelFilterColor`, `buildModelFilterTabs` mentionnées dans l'audit initial **n'existaient pas dans le code**. C'était un mythe.

### Solution : `MODEL_META` + `getModelMeta()`

Créé un objet centralisé `MODEL_META` (ligne ~7932) avec fallback `DEFAULT_MODEL_META` et un helper unique `getModelMeta(name)`.

### Liste des 32 hardcodes corrigés

| # | Ligne | Emplacement | Avant | Après |
|---|-------|------------|-------|-------|
| 1 | 7927 | SPENDER_MODEL_COLORS | 7 modèles, pas Alice | Alice ajoutée |
| 2 | 16055 | Spender multi-badges emoji | `{carla:'💜',sophie:'💙',...}` | `getModelMeta(m.name).emoji` |
| 3 | 16061 | Spender single badge emoji | `({carla:'💜',...})[name]` | `getModelMeta(name).emoji` |
| 4 | 14803 | Spender popup multi-emoji | Hardcodé 5 modèles | `getModelMeta(m.name).emoji` |
| 5 | 33229 | `getModelColor()` | 4 modèles (pas Lea, pas Alice) | 6 modèles (Lea + Alice ajoutées) |
| 6 | 34218 | Grid Premium `modelEmoji` | Ternary chain 5 modèles | `getModelMeta(n).emoji` |
| 7 | 34475 | Grid Premium labels | Object hardcodé 6 entries | Construit dynamiquement via `models.map` + `getModelMeta` |
| 8 | 34956 | Grid Premium modal emoji | Ternary chain inline | `getModelMeta(name).emoji` |
| 9 | 35733 | TLG Pro `modelEmoji` | Ternary chain 5 modèles | `getModelMeta(name).emoji` |
| 10 | 35738 | TLG Pro `modelBadge` | Object hardcodé 5 modèles | `getModelMeta(name).badge` |
| 11 | 35889 | TLG Pro header emojis | Object hardcodé 6 entries | Construit dynamiquement via `modelKeys.map` + `getModelMeta` |
| 12 | 35890 | TLG Pro header tabColors | Object hardcodé 6 entries | Construit dynamiquement via `modelKeys.map` + `getModelMeta` |
| 13 | 36008 | TLG Pro `modelDefs` | Array hardcodé 4 modèles | `(models).map(m => ...)` + `getModelMeta` |
| 14 | 36292 | TLG Pro picker `emo` | Object hardcodé 5 modèles | `getModelMeta(m.name).emoji` |
| 15 | 36594 | TINDADA `modelEmoji` | Ternary chain 5 modèles | `getModelMeta(name).emoji` |
| 16 | 38592 | DADACAST analytics emoji | Ternary chain 5 modèles | `getModelMeta(m.model).emoji` |
| 17 | 38897 | DADACAST `MODEL_COLORS` | 4 modèles (pas Lea, pas Alice) | 6 modèles |
| 18 | 39262 | DADACAST broadcast emoji | Ternary chain 5 modèles | `getModelMeta(m.name).emoji` |
| 19 | 43319-43332 | Dashboard `MODEL_COLORS` light | 5 modèles | Alice ajoutée (indigo #4f46e5) |
| 20 | 43334-43339 | Dashboard `MODEL_COLORS` dark | 5 modèles | Alice ajoutée (indigo #6366f1) |
| 21 | 43342 | Dashboard `MODEL_ORDER` | Array hardcodé 5 noms | Dynamique via `(models).map(...)` |
| 22 | 43610 | Conversations avatar gradient | Ternary chain 4 modèles | `getModelMeta(name).gradient` |
| 23 | 43708 | Conversations chat avatar grad | Ternary chain 4 modèles | `getModelMeta(name).gradient` |
| 24 | 44364 | Spender popup avatar gradient | Ternary chain 4 modèles | `getModelMeta(name).gradient` |
| 25 | 44810 | Broadcast preview string | Ternary 3 modèles | Dynamique via `models.find` + `getModelMeta` |
| 26 | 47217 | Media Library `MODELS_V2` | Array hardcodé 5 modèles | `Object.entries(MODEL_META).map(...)` |
| 27 | 47522 | Scripts `modelColor` | Ternary 3 modèles | `getModelMeta(id).color` |
| 28 | 48317 | Campaign `modelColor` | Ternary 3 modèles | `getModelMeta(id).color` |
| 29 | 60523 | Conversations `modelEmoji` | Map 4 modèles | `getModelMeta(name).emoji` |
| 30 | 60887 | Spender info multi-emoji | Map 4 modèles | `getModelMeta(m.name).emoji` |
| 31 | 60989 | Spender detail multi-emoji | Map 4 modèles | `getModelMeta(m.name).emoji` |
| 32 | 60994 | Spender detail single-emoji | Map 4 modèles | `getModelMeta(m.name).emoji` |

---

## ÉTAPE 3 — VÉRIFICATION PAR PAGE

| Page/Feature | Alice OK ? | Détail |
|---|---|---|
| **Dashboard tabs** | OK | `modelOptions` construit dynamiquement depuis `models` DB |
| **Dashboard KPIs** | OK | Filtrés par `model_id` dynamiquement |
| **Dashboard model grid cards** | OK | `MODEL_ORDER` maintenant dynamique + `MODEL_COLORS` a alice |
| **Conversations filtres** | OK | Avatar gradient via `getModelMeta().gradient` |
| **Conversations avatars** | OK | 3 gradients ternaires remplacés par `getModelMeta` |
| **Grid Premium filtres** | OK | Labels + emojis construits dynamiquement via `getModelMeta` |
| **Grid Premium emoji cellules** | OK | `modelEmoji` via `getModelMeta` |
| **TLG Pro filtres** | OK | `emojis` + `tabColors` construits dynamiquement |
| **TLG Pro badges** | OK | `modelBadge` via `getModelMeta().badge` |
| **TLG Pro custom filter** | OK | `modelDefs` construit depuis `models.map` |
| **TLG Pro picker** | OK | Emojis via `getModelMeta` |
| **TINDADA filtres** | OK | `modelEmoji` via `getModelMeta` |
| **Spenders badges** | OK | Emojis multi/single via `getModelMeta` |
| **Spenders couleurs** | OK | `SPENDER_MODEL_COLORS` a Alice |
| **Équipe > Modèles** | OK | Construit dynamiquement depuis `models` DB |
| **DADACAST sélection** | OK | `models.map` — dynamique depuis DB |
| **DADACAST emojis** | OK | Via `getModelMeta` |
| **DADACAST couleurs** | OK | `MODEL_COLORS` a alice + lea |
| **Media Library tabs** | OK | `MODELS_V2` construit depuis `MODEL_META` |
| **Scripts couleur** | OK | `modelColor` via `getModelMeta` |
| **Broadcast preview** | OK | Dynamique via `models.find` + `getModelMeta` |

---

## ÉTAPE 4 — MODEL_META (helper centralisé)

```javascript
const MODEL_META = {
  carla:  { emoji: '💜', color: '#a78bfa', tabColor: '#a78bfa', gradient: '...', badge: {...} },
  sophie: { emoji: '🩷', color: '#f472b6', tabColor: '#f472b6', gradient: '...', badge: {...} },
  bella:  { emoji: '💛', color: '#fb923c', tabColor: '#fb923c', gradient: '...', badge: {...} },
  nadia:  { emoji: '✨', color: '#a855f7', tabColor: '#9ca3af', gradient: '...', badge: {...} },
  lea:    { emoji: '🤍', color: '#e2e8f0', tabColor: '#e2e8f0', gradient: '...', badge: {...} },
  alice:  { emoji: '🦋', color: '#6366f1', tabColor: '#6366f1', gradient: '...', badge: {...} },
};
const DEFAULT_MODEL_META = { emoji: '👤', color: '#64748b', ... };
const getModelMeta = (name) => MODEL_META[(name || '').toLowerCase()] || DEFAULT_MODEL_META;
```

| Helper | Fallback si inconnu | Alice gérée |
|---|---|---|
| `getModelMeta(name).emoji` | '👤' | '🦋' |
| `getModelMeta(name).color` | '#64748b' | '#6366f1' |
| `getModelMeta(name).gradient` | fallback indigo | indigo gradient |
| `getModelMeta(name).tabColor` | '#64748b' | '#6366f1' |
| `getModelMeta(name).badge` | gray badge | indigo badge |

---

## ÉTAPE 5 — RÉSUMÉ

### Ce qui a été fait
1. **Créé `MODEL_META`** — objet centralisé avec emoji, color, tabColor, gradient, badge pour les 6 modèles + fallback
2. **Remplacé 32 hardcodes** dans index.html par des appels à `getModelMeta()`
3. **Ajouté Alice** dans tous les objets de configuration restants (dashboard MODEL_COLORS light/dark, DADACAST MODEL_COLORS, getModelColor, SPENDER_MODEL_COLORS)
4. **Rendu dynamiques** les listes statiques : MODEL_ORDER, modelDefs, labels, emojis/tabColors, MODELS_V2
5. **Unifié les emojis** — anciennes pages utilisaient 💙🧡💟, nouvelles utilisaient 🩷💛✨. Tout passe maintenant par MODEL_META

### Notes
- Les `useState('carla')` (valeurs par défaut initiales) sont conservées — pas des listing hardcodes
- Les objets dashboard `MODEL_COLORS` light/dark restent hardcodés (12 champs par modèle par thème) mais Alice y est
- Pour un **futur 7ème modèle** : ajouter 1 entrée dans `MODEL_META` + dans les 3 objets complexes restants. Tout le reste est automatique.
