# AUDIT INTÉGRATION ALICE — RAPPORT ALFRED

**Date :** 2026-03-25
**Auditeur :** ALFRED (Claude)
**Branche :** `claude/audit-alice-integration-SuOIr`
**Mode :** Read-only — aucune modification de code

---

## ÉTAPE 1 — VÉRIFICATION TABLE MODELS

### Requêtes Supabase vers `models`
Le CRM charge les modèles depuis la table `models` via Supabase à plusieurs endroits :

| Ligne | Requête |
|-------|---------|
| 13130 | `sb.from("models").update({name:...}).eq("id", selM.id)` |
| 13279 | `sb.from("models").select("id").eq("name", name).maybeSingle()` |
| 13281 | `sb.from("models").insert({name})` |
| 28062 | `sb.from("models").update({name}).eq("name", oldName)` |
| 50004 | `sb.from("models").select("id").ilike("name", ...)` |
| 55291 | `sb.from("models").select("id,name").order("name")` |
| 62459 | `sb.from("models").select("*")` — chargement global |

**Constat :** Alice a été créée via DADASH (interface CRM, pas directement Supabase). Son insertion passe par la ligne 13281 (`sb.from("models").insert({name})`). Si le processus s'est terminé sans erreur, Alice est dans la table `models`.

> **NOTE :** Sans accès direct à la base Supabase, impossible de vérifier visuellement l'UUID ou les doublons. Il faudrait exécuter :
> ```sql
> SELECT id, name, created_at FROM models ORDER BY created_at;
> ```
> Pour confirmer : 6 modèles, pas de doublon Alice, UUID valide.

### Migration de sécurité
- Ligne `migrations/20260407_sync_models_from_profiles.sql:32` : safety net INSERT pour Bella uniquement. Pas de risque de conflit avec Alice.

---

## ÉTAPE 2 — GREP HARDCODES

### CONSTAT MAJEUR : Les helpers centralisés `getDynModel*` N'EXISTENT PAS

> **Les fonctions `getDynModelEmoji`, `getDynModelColor`, `getDynModelGradient`, `getDynModelCover`, `getDynModelBadge`, `getDynModelFilterColor` et `buildModelFilterTabs` ne sont PAS présentes dans le code.**

Grep sur tout le repo pour `getDyn` et `buildModelFilter` : **0 résultats**.

Contrairement à ce qui était attendu après l'intégration de Lea, **le CRM n'a PAS été rendu entièrement dynamique**. Les émojis, couleurs et badges sont hardcodés à **20+ endroits** dans `index.html`.

### Liste exhaustive des hardcodes

#### A. Mappings emoji (modèle → emoji)

| Ligne(s) | Contenu | Modèles inclus | Alice ? | Fallback |
|-----------|---------|-----------------|---------|----------|
| 16055, 16061 | `{carla:'💜',sophie:'💙',bella:'🧡',nadia:'💟',lea:'🤍'}` | 5 | **NON** | `'👤'` |
| 34218 | Ternaire `n === "carla" ? "💜" : ... : "👤"` | 5 (incl. Lea) | **NON** | `"👤"` |
| 34956 | Même ternaire (modal Grid Premium) | 5 (incl. Lea) | **NON** | `"👤"` |
| 35733 | Même ternaire (TLG Pro) | 5 (incl. Lea) | **NON** | `"👤"` |
| 36594 | Même ternaire (TINDADA) | 5 (incl. Lea) | **NON** | `"👤"` |
| 38592 | Même ternaire (DADACAST analytics) | 5 (incl. Lea) | **NON** | `"👤"` |
| 39262 | Même ternaire (DADACAST broadcast selector) | 5 (incl. Lea) | **NON** | `"👤"` |
| 60523 | `{ carla: '💜', sophie: '💙', bella: '🧡', nadia: '💟' }` | **4 seulement** | **NON** | `'👤'` |
| 60887 | `{carla:'💜',sophie:'💙',bella:'🧡',nadia:'💟'}` | **4 seulement** | **NON** | `'👤'` |
| 60994 | `{carla:'💜',sophie:'💙',bella:'🧡',nadia:'💟'}` | **4 seulement** | **NON** | `'👤'` |

#### B. Mappings couleur (modèle → couleur)

| Ligne(s) | Variable | Modèles inclus | Alice ? | Fallback |
|-----------|----------|-----------------|---------|----------|
| 7927 | `SPENDER_MODEL_COLORS` | Carla, Sofia, Sophie, Luna, Bella, Nadia, Lea | **NON** | `"#64748b"` (gris) |
| 33230-33235 | `getModelColor()` | carla, bella, sophie, nadia | **NON** (ni Lea) | `{ bg: "#6b7280" }` (gris) |
| 38897-38902 | `MODEL_COLORS` (DADACAST) | carla, sophie, bella, nadia | **NON** (ni Lea) | `{ bg: "#6366f1" }` via `getModelClr` |
| 43319-43332 | `MODEL_COLORS` (Dashboard grid, light+dark) | carla, lea, bella, sophie, nadia | **NON** | Pas de fallback explicite |
| 47522 | `modelColor()` (Media Library) | carla, bella, nadia | **NON** (ni Sophie, ni Lea) | `'#1d4ed8'` |
| 48317 | `modelColor()` (Campaigns) | carla, bella, nadia | **NON** (ni Sophie, ni Lea) | `'#3b82f6'` |

#### C. Mappings labels/badges

| Ligne(s) | Variable | Modèles inclus | Alice ? | Fallback |
|-----------|----------|-----------------|---------|----------|
| 34475 | `labels` (Grid Premium tabs) | all, carla, sophie, bella, nadia, lea | **NON** | `undefined` → bouton sans texte |
| 35738 | `modelBadge()` cfg (TLG Pro) | carla, sophie, bella, nadia, lea | **NON** | `{ bg: "rgba(156,163,175,0.2)", color: "#9ca3af" }` (gris) |
| 35889 | `emojis` (TLG Pro tabs) | all, carla, sophie, bella, nadia, lea | **NON** | `undefined` |
| 35890 | `tabColors` (TLG Pro tabs) | all, carla, sophie, bella, nadia, lea | **NON** | `undefined` |

#### D. Arrays/listes statiques

| Ligne(s) | Variable | Contenu | Alice ? |
|-----------|----------|---------|---------|
| 36008-36012 | `modelDefs` (TLG Pro custom filter) | carla, sophie, bella, nadia | **NON** (ni Lea !) |
| 43335 | `MODEL_ORDER` (Dashboard grid) | carla, lea, bella, sophie, nadia | **NON** |
| 47217-47222 | `MODELS_V2` (Media Library) | carla, sophie, bella, nadia, lea | **NON** |
| 7931-7935 | `MODEL_ID_TO_NAME` (UUID map) | Carla, Sophie, Bella (3 UUIDs) | **NON** — mais synchronisé dynamiquement via `_syncModelIdMap()` (ligne 7937) |

#### E. Defaults hardcodés

| Ligne | Code | Impact |
|-------|------|--------|
| 40911 | ~~`useState("carla")`~~ — **corrigé** : ligne 38728 `useState("")` | Broadcast default = vide, dynamique |
| 47055 | `useState('carla')` | Media Library default = carla |
| 47062 | `useState('carla')` | Media upload default = carla |

---

## ÉTAPE 3 — VÉRIFICATION PAR PAGE

### Dashboard

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| Filtres modèle (select) | ✅ OUI — `modelOptions.map(m => <option>)` (L.11953) | ✅ OUI | Dropdown dynamique depuis `models` |
| KPIs par modèle | ✅ OUI — filtre par `model_id` (L.11747) | ✅ OUI | Filtrage dynamique |
| MODEL_ORDER grid (cards) | ❌ NON — `["carla","lea","bella","sophie","nadia"]` (L.43335) | ❌ NON | Alice absente du grid 3x2 |
| MODEL_COLORS grid | ❌ NON — hardcodé 5 modèles (L.43319-43332) | ❌ NON | Pas de couleur pour Alice |
| Sparklines (DashboardAnalytics) | ✅ OUI — `MODEL_COLORS` array générique (L.10967) | ✅ OUI | Array de 8 couleurs par index |

### Conversations (Messagerie)

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| Filtres pills | ⚠️ SEMI — tabs dynamiques `models.map()` (L.34474) mais labels hardcodés (L.34475) | ⚠️ PARTIEL | Tab présent mais label = `undefined` |
| Avatar emoji | ❌ NON — ternaire 5 modèles (L.34218) | ⚠️ FALLBACK | Affiche `👤` au lieu d'un emoji dédié |
| Couleur filtre | N/A — pas de couleur par modèle dans les pills | — | — |

### Grid Premium

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| Filter tabs | ⚠️ SEMI — `models.map()` (L.34474) + `labels` hardcodé (L.34475) | ⚠️ PARTIEL | Tab visible, label `undefined` |
| Model emoji cells | ❌ NON — ternaire 5 modèles (L.34218) | ⚠️ FALLBACK | `👤` pour Alice |
| Modal conv picker | ❌ NON — ternaire 5 modèles (L.34956) | ⚠️ FALLBACK | `👤` pour Alice |

### TLG Pro

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| Filter tabs | ⚠️ SEMI — `modelKeys` dynamique (L.35888) mais `emojis`/`tabColors` hardcodés (L.35889-35890) | ⚠️ PARTIEL | Tab présent, emoji/couleur = `undefined` |
| Model badge | ❌ NON — `cfg` hardcodé (L.35738) | ⚠️ FALLBACK | Badge gris par défaut |
| Model emoji | ❌ NON — ternaire 5 modèles (L.35733) | ⚠️ FALLBACK | `👤` pour Alice |
| Custom filter (modelDefs) | ❌ NON — 4 modèles seulement (L.36008-36012) | ❌ NON | Même Lea est absente ! |
| Picker filter | ⚠️ SEMI — `models.map()` (L.36292) + `emo` hardcodé | ⚠️ FALLBACK | `👤` pour Alice |

### TINDADA (Inbox Zero)

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| Conversations affichées | ✅ OUI — charge toutes les convs non-lues | ✅ OUI | Alice incluse si convs existent |
| Model emoji | ❌ NON — ternaire 5 modèles (L.36594) | ⚠️ FALLBACK | `👤` pour Alice |
| Pas de filtres par modèle | N/A | — | TINDADA n'a pas de filtre modèle |

### Spenders

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| Filtres par modèle | ✅ OUI — `SPENDER_MODEL_FILTER_MODELS` dynamique (L.7943-7948) | ✅ OUI | Sync depuis DB |
| Multi-model badges emoji | ❌ NON — `{carla:'💜',...}` 5 modèles (L.16055) | ⚠️ FALLBACK | `👤` pour Alice |
| Single model badge | ✅ PARTIEL — couleur via `getSpenderModelColor` (L.7928) | ⚠️ FALLBACK | Couleur grise `#64748b` |
| `SPENDER_MODEL_COLORS` | ❌ NON — 7 entrées hardcodées (L.7927) | ❌ NON | Alice absente = gris |
| Popup spender (multi) | ❌ NON — 4 modèles seulement (L.60887, 60994) | ⚠️ FALLBACK | `👤`, même Lea manque |

### Équipe > Modèles (Gestion)

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| Liste des modèles | ✅ OUI — `models.map()` (L.39898, 39943) | ✅ OUI | Dynamique depuis DB |
| Assignation chatters | ✅ OUI — via `assigned_models` JSONB (L.40140) | ✅ OUI | Dynamique |

### DADACAST (Broadcast)

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| Sélection modèle | ✅ OUI — `models.map()` (L.39250) | ✅ OUI | Dynamique |
| Default broadcast model | ✅ OUI — `useState("")` + auto-select 1er modèle (L.38728, 38765) | ✅ OUI | |
| Emoji dans selector | ❌ NON — ternaire 5 modèles (L.39262) | ⚠️ FALLBACK | `👤` |
| Preview couleur | ❌ NON — `MODEL_COLORS` 4 modèles (L.38897-38902) | ⚠️ FALLBACK | Couleur indigo par défaut |
| Analytics emoji | ❌ NON — ternaire 5 modèles (L.38592) | ⚠️ FALLBACK | `👤` |

### Media Library

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| `MODELS_V2` tabs | ❌ NON — 5 modèles hardcodés (L.47217-47222) | ❌ NON | Alice absente des tabs |
| Default model | ❌ NON — `useState('carla')` (L.47055, 47062) | — | Pas bloquant |
| `modelColor()` | ❌ NON — 3 modèles (L.47522) | ⚠️ FALLBACK | Bleu par défaut |

### Scripts

| Élément | Dynamique ? | Alice OK ? | Détail |
|---------|-------------|------------|--------|
| `modelColor()` | ❌ NON — 3 modèles (L.47522) | ⚠️ FALLBACK | Bleu par défaut |
| Liste scripts | ✅ OUI — chargement DB | ✅ OUI | — |

---

## ÉTAPE 4 — HELPERS DYNAMIQUES

### CONSTAT : Les helpers centralisés n'existent pas

| Helper attendu | Présent dans le code ? | Implémentation réelle |
|----------------|------------------------|-----------------------|
| `getDynModelEmoji(name)` | ❌ NON | Ternaires hardcodés à 10+ endroits |
| `getDynModelColor(name)` | ❌ NON | Objets `MODEL_COLORS` / `getModelColor` hardcodés à 6+ endroits |
| `getDynModelGradient(name)` | ❌ NON | Pas de gradient system centralisé |
| `getDynModelCover(name)` | ❌ NON | N'existe nulle part |
| `getDynModelBadge(name)` | ❌ NON | `modelBadge()` hardcodé localement (L.35736-35740) |
| `getDynModelFilterColor(name)` | ❌ NON | `tabColors` hardcodé localement (L.35890) |
| `buildModelFilterTabs(models)` | ❌ NON | Chaque page construit ses propres tabs |

### Helpers existants avec fallback

| Helper | Ligne | Modèles hardcodés | Fallback | Alice |
|--------|-------|--------------------|----------|-------|
| `getSpenderModelColor(name)` | 7928 | Carla, Sofia, Sophie, Luna, Bella, Nadia, Lea | `"#64748b"` (gris) | ⚠️ Gris |
| `getModelColor(modelName)` | 33229-33237 | carla, bella, sophie, nadia | `{ bg: "#6b7280" }` (gris) | ⚠️ Gris |
| `getModelClr(name)` | 38903 | carla, sophie, bella, nadia | `{ bg: "#6366f1" }` (indigo) | ⚠️ Indigo |
| `resolveModelFromId(id, models)` | 7956 | Dynamique via DB | `null` | ✅ OK |
| `_syncModelIdMap(models)` | 7937 | Synchro dynamique | — | ✅ OK |
| `_syncSpenderModelFilter(models)` | 7944 | Dynamique | — | ✅ OK |

---

## ÉTAPE 5 — RÉSUMÉ

### Tableau récapitulatif

| Page/Feature | Alice OK ? | Détail |
|--------------|------------|--------|
| Dashboard filtres (select) | ✅ OUI | Dropdown dynamique |
| Dashboard KPIs | ✅ OUI | Filtrage par model_id |
| Dashboard grid cards | ❌ NON | `MODEL_ORDER` hardcodé sans Alice |
| Dashboard grid couleurs | ❌ NON | `MODEL_COLORS` hardcodé sans Alice |
| Conversations/Grid filtres | ⚠️ PARTIEL | Tab présent, label `undefined` |
| Conversations emoji | ⚠️ FALLBACK | `👤` générique |
| Grid Premium filtres | ⚠️ PARTIEL | Idem conversations |
| Grid Premium emoji | ⚠️ FALLBACK | `👤` générique |
| TLG Pro tabs | ⚠️ PARTIEL | Tab visible, emoji/couleur `undefined` |
| TLG Pro badges | ⚠️ FALLBACK | Badge gris par défaut |
| TLG Pro custom filter | ❌ NON | `modelDefs` = 4 modèles (même pas Lea) |
| TLG Pro picker | ⚠️ FALLBACK | `👤` |
| TINDADA convs | ✅ OUI | Toutes convs chargées |
| TINDADA emoji | ⚠️ FALLBACK | `👤` |
| Spenders filtres | ✅ OUI | Dynamique depuis DB |
| Spenders badges | ⚠️ FALLBACK | Emoji `👤`, couleur grise |
| Spenders popup multi | ⚠️ FALLBACK | 4 modèles seulement (Lea aussi manque) |
| Équipe > Modèles | ✅ OUI | Entièrement dynamique |
| DADACAST sélection | ✅ OUI | `models.map()` dynamique |
| DADACAST emoji | ⚠️ FALLBACK | `👤` |
| DADACAST couleur | ⚠️ FALLBACK | Indigo par défaut |
| Media Library tabs | ❌ NON | `MODELS_V2` hardcodé, Alice absente |
| Media Library couleur | ⚠️ FALLBACK | Bleu par défaut |
| Scripts couleur | ⚠️ FALLBACK | Bleu par défaut |

### Légende
- ✅ **OUI** = Alice apparaît automatiquement, aucun changement requis
- ⚠️ **PARTIEL/FALLBACK** = Alice apparaît mais avec un emoji générique (`👤`) ou une couleur grise/par défaut
- ❌ **NON** = Alice est complètement absente de cette fonctionnalité

---

## ACTIONS REQUISES

**Alice N'apparaît PAS automatiquement partout.** Contrairement à ce qui était attendu, le CRM n'est que **partiellement dynamique**. Voici les actions nécessaires :

### Priorité CRITIQUE (Alice invisible)

1. **L.43335** — `MODEL_ORDER` : ajouter `"alice"` à l'array pour que la card Alice apparaisse dans le dashboard grid
2. **L.43319-43332** — `MODEL_COLORS` (dashboard grid, light+dark) : ajouter une entrée `alice` avec ses couleurs
3. **L.47217-47222** — `MODELS_V2` (Media Library) : ajouter `{ key: 'alice', icon: '🎀', label: 'Alice' }` (ou emoji choisi)
4. **L.36008-36012** — `modelDefs` (TLG Pro custom filter) : ajouter Alice ET Lea

### Priorité HAUTE (fallback générique `👤`)

5. **L.34218, 34956, 35733, 36594, 38592, 39262** — Toutes les chaînes ternaires `modelEmoji` : ajouter `n === "alice" ? "🎀" : ...` (ou centraliser via un vrai helper)
6. **L.34475** — `labels` (Grid Premium) : ajouter `alice: "🎀 Alice"`
7. **L.35889** — `emojis` (TLG Pro tabs) : ajouter `alice: "🎀"`
8. **L.35890** — `tabColors` (TLG Pro tabs) : ajouter `alice: "#<couleur>"`
9. **L.35738** — `modelBadge` cfg (TLG Pro) : ajouter entrée `alice`
10. **L.16055, 16061** — Spenders emoji mappings : ajouter `alice: '🎀'`
11. **L.36292** — TLG Pro picker emoji : ajouter `alice: "🎀"` dans l'objet `emo`

### Priorité MOYENNE (couleurs de fallback)

12. **L.7927** — `SPENDER_MODEL_COLORS` : ajouter `Alice: "#<couleur>"`
13. **L.33230-33235** — `getModelColor()` : ajouter `alice` (et `lea` qui manque aussi)
14. **L.38897-38902** — `MODEL_COLORS` (DADACAST) : ajouter `alice` (et `lea`)
15. **L.47522** — `modelColor()` (Media Library) : ajouter alice, sophie, lea
16. **L.48317** — `modelColor()` (Campaigns) : ajouter alice, sophie, lea
17. **L.60523, 60887, 60994** — Emoji maps conversations : ajouter `alice` (et `lea` aux 2 derniers)

### RECOMMANDATION ARCHITECTURALE

**Créer les helpers centralisés promis** (`getDynModelEmoji`, `getDynModelColor`, etc.) qui lisent depuis la table `models` avec des métadonnées (emoji, couleur, gradient) stockées en base. Cela évitera de devoir modifier 20+ endroits à chaque ajout de modèle.

Alternative minimale : créer un objet centralisé `MODEL_META` en haut du fichier, alimenté au chargement des modèles, et remplacer tous les hardcodes par des lookups dans cet objet.

---

## ANNEXE — Éléments déjà dynamiques (aucune action requise)

Ces éléments utilisent `models.map()` ou un chargement DB et intègreront Alice automatiquement :

- Dashboard model filter dropdown (L.11953)
- Dashboard KPI filtering (L.11747)
- Spenders model filter (L.7943-7948, `_syncSpenderModelFilter`)
- Model ID resolution (L.7937, `_syncModelIdMap`)
- Équipe > Gestion modèles (L.39898, 39943, 40140)
- DADACAST model selector buttons (L.39250)
- DADACAST broadcast default model (L.38728, 38765)
- Sparkline chart colors (L.10967, array générique par index)
- Transaction model_id filters (toutes pages)
- Model select dropdowns (L.10702, 10736, 13741, etc.)

---

*Fin du rapport d'audit — ALFRED*
