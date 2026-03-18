# AUDIT ALFRED — GRISAGE MEDIAS

> **Date :** 2026-03-18
> **Branche :** `claude/audit-media-sends-IaG9G`
> **Scope :** Système complet de grisage des médias (media_sends, sent_medias, transactions.media_id, rendu galerie, cross-model)

---

## 1. Système `media_sends`

### 1.1 Table & Schema

La table `media_sends` **existe en production** mais **n'a PAS de fichier de migration** versionné dans le repo. Champs inférés du code :

| Champ | Type (inféré) | Usage |
|-------|---------------|-------|
| `media_id` | UUID | FK vers `media_library.id` |
| `chat_id` | TEXT/STRING | ID de conversation Telegram |
| `model` | TEXT | Nom du modèle (string, PAS un UUID) |
| `created_at` | TIMESTAMP | Auto (implicite) |

**Remarque critique :** Pas de `spender_id` dans cette table. Le tracking se fait **par `chat_id`** uniquement.

### 1.2 Endpoint / Queries

Pas d'endpoint API dédié. Tout passe par Supabase JS client directement.

**SELECT (fetch des médias envoyés) :**
```javascript
sb.from('media_sends').select('media_id').eq('chat_id', String(chatId))
```

| Fichier | Ligne(s) | Contexte |
|---------|----------|----------|
| `index.html` | 31748-31764 | Helper `window._getSentMediaIds(chatId)` |
| `index.html` | 36366-36368 | Grid Premium — chargement galerie |
| `index.html` | 40223-40225 | DadashMessagerieTab — chargement galerie |
| `index.html` | 58760-58762 | GridConversationCell — chargement galerie |

**INSERT (enregistrement après envoi) :**
```javascript
sb.from('media_sends').insert({ media_id: X, chat_id: String(Y), model: Z })
```

| Fichier | Ligne(s) | Contexte | Error handling |
|---------|----------|----------|----------------|
| `index.html` | 32509 | LibraryModal — envoi confirmé | `.catch(() => {})` silencieux |
| `index.html` | 36597 | Grid Premium — envoi média | `.catch(() => {})` silencieux |
| `index.html` | 42330-42334 | DadashMessagerieTab — envoi | `await` sans catch explicite |
| `index.html` | 58719 | GridConversationCell — envoi | `.catch(() => {})` silencieux |

### 1.3 Mise à jour au moment de l'envoi

**Flow :**
1. User sélectionne un média dans la galerie
2. POST vers `/send-media` ou `/send-video` (API Carlos)
3. Succès → INSERT fire-and-forget dans `media_sends`
4. State local mis à jour : `setSentMediaIds([...prev, pendingMedia.id])`

### 1.4 Identification & grisage au chargement

Au chargement de la galerie :
1. Query `media_sends WHERE chat_id = chatId` → liste de `media_id`
2. Stockage dans state `sentMediaIds`
3. Passage en prop à `MediaPanelGrid` ou `LibraryModal`
4. Check : `sentMediaIds.includes(item.id)` → `isSent = true`

### 1.5 Filtre : par `chat_id` (PAS par `spender_id`)

**BUG CRITIQUE :** Le filtre est `.eq('chat_id', chatId)`. Chaque conversation modèle-spender a un `chat_id` différent. Donc si Carla envoie une photo à SpenderX (`chat_id=123`), et qu'on ouvre Bella avec SpenderX (`chat_id=456`), la photo N'EST PAS grisée dans `media_sends`.

Le système `sent_medias` (section 2) a été créé pour corriger ce problème.

---

## 2. Système `sent_medias`

### 2.1 Table & Schema

**Migration :** `/migrations/20260315_sent_medias.sql` (existe et est versionné)

```sql
CREATE TABLE IF NOT EXISTS sent_medias (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_url  TEXT NOT NULL,
  spender_id UUID NOT NULL,
  model_id   UUID NOT NULL,
  sent_at    TIMESTAMP DEFAULT NOW(),
  sent_via   TEXT,  -- 'conversation' | 'tindada' | 'grid_premium' | 'tlg_pro'
  CONSTRAINT unique_sent_media UNIQUE(media_url, spender_id, model_id)
);
```

**Indexes :**
- `idx_sent_medias_lookup` sur `(spender_id, model_id)`
- `idx_sent_medias_date` sur `(sent_at DESC)`

**RLS :** Activé, avec policy permissive `USING (true) WITH CHECK (true)`.

### 2.2 Différence fondamentale avec `media_sends`

| Aspect | `media_sends` | `sent_medias` |
|--------|---------------|---------------|
| **Clé de tracking** | `chat_id` (conversation) | `spender_id + model_id` (personne+modèle) |
| **Identifiant média** | `media_id` (UUID) | `media_url` (TEXT) |
| **Scope** | Per-conversation | Cross-conversation |
| **Migration versionnée** | NON | OUI |
| **Cross-model** | NON | Par modèle uniquement |
| **Unique constraint** | Inconnu | `(media_url, spender_id, model_id)` |

### 2.3 Fonctions helpers

**`markMediaAsSent(mediaUrl, spenderId, modelId, sentVia)`** — `index.html:31708-31722`
```javascript
await window.sb.from('sent_medias').upsert(
  { media_url, spender_id, model_id, sent_via, sent_at: new Date().toISOString() },
  { onConflict: 'media_url,spender_id,model_id', ignoreDuplicates: false }
);
```
- Exposé globalement : `window._markMediaAsSent`
- Error handling : log console, pas de throw

**`getSentMediaUrls(spenderId, modelId)`** — `index.html:31728-31742`
```javascript
await window.sb.from('sent_medias').select('media_url')
  .eq('spender_id', spenderId).eq('model_id', modelId);
```
- Retourne `string[]` (URLs)
- Exposé globalement : `window._getSentMediaUrls`
- En cas d'erreur : retourne `[]` (pas de crash)

### 2.4 Usage par page

| Page | Appel `markMediaAsSent` | `sent_via` | Appel `getSentMediaUrls` |
|------|------------------------|------------|--------------------------|
| Tindada | L.36153 | `'tindada'` | L.36377 |
| Grid Premium | L.33635 | `'grid'` | L.33146 |
| TlgPro | L.36548, 36593, 36632 | `'tlg_pro'` | L.34584 |
| Messagerie | L.40240 (getSentMediaUrls) | — | L.40240 |

### 2.5 Relation avec `media_sends`

Les deux systèmes sont **complémentaires** et **coexistent** :
- `media_sends` : tracking historique per-chat (par `media_id`)
- `sent_medias` : tracking cross-page per-spender (par `media_url`)

Les deux sont consultés au chargement de la galerie. Un média est grisé si trouvé dans **l'un ou l'autre**.

### 2.6 Si la table n'existe pas

Le code **échoue silencieusement** :
- `markMediaAsSent` : log console + continue
- `getSentMediaUrls` : log console + retourne `[]`
- Le grisage cross-page ne fonctionne simplement pas, mais l'app ne crash pas.

---

## 3. Système `transactions.media_id`

### 3.1 Le problème

Le code query `transactions.media_id` à **3 endroits** :

```javascript
sb.from("transactions").select("media_id").eq("spender_id", spId).not("media_id", "is", null)
```

| Fichier | Ligne(s) | Contexte | Error handling |
|---------|----------|----------|----------------|
| `index.html` | 36372-36373 | GridPremiumModal | `.catch(() => {})` silencieux |
| `index.html` | 40228-40230 | DadashMessagerieTab | `.catch(err => console.warn(...))` |
| `index.html` | 58765-58767 | GridConversationCell | `.catch(() => {})` silencieux |

### 3.2 Le champ `media_id` N'EXISTE PAS sur `transactions`

**Vérifié :** Aucune migration n'ajoute de colonne `media_id` à la table `transactions`. Les colonnes existantes sont :
- `id`, `spender_id`, `amount`, `status`, `date`, `chatter_id`, `provider_id`
- `currency`, `amount_original`, `currency_original` (migration 20260225)
- `invoice_url` (migration 20260312)

### 3.3 Conséquence

- La query retourne **toujours une erreur ou un résultat vide**
- `soldMediaIds` est **toujours `[]`**
- Le grisage "Vendu" (💰) ne fonctionne **JAMAIS**
- L'overlay "Vendu" dans `MediaPanelGrid` est du code mort en pratique

### 3.4 Est-ce une 3ème source pour le grisage ?

**Oui, par intention.** Le design prévoit 3 niveaux de grisage :
1. `isSent` = média déjà envoyé (via `media_sends` ou `sent_medias`)
2. `isSold` = média déjà vendu/transactionné (via `transactions.media_id`)
3. `isUsed = isSent || isSold` = combinaison

Mais le niveau 2 est **non-fonctionnel** car le champ n'existe pas.

---

## 4. Rendu galerie

### 4.1 Composant `MediaPanelGrid` — `index.html:38975-39169`

```javascript
const isSent = sentMediaIds.includes(item.id);
const isSold = soldMediaIds.includes(item.id);  // toujours false (cf. section 3)
const isUsed = isSent || isSold;
```

**Rendu visuel :**

| Propriété | Valeur si `isUsed` | Valeur normale |
|-----------|-------------------|----------------|
| `opacity` | `0.45` | `1` |
| `filter` | `grayscale(60%)` | `none` |
| `cursor` | `default` | `pointer` |
| `onClick` | bloqué (`!isUsed && onSelect(item)`) | actif |

**Overlay badge (L.39146-39164) :**
```jsx
{isUsed && (
  <div style={{ background: "rgba(0,0,0,0.45)", ... }}>
    <span>{isSold ? "💰" : "📤"}</span>
    <span style={{ color: isSold ? "#fbbf24" : "#94a3b8" }}>
      {isSold ? "Vendu" : "Envoyé"}
    </span>
  </div>
)}
```

### 4.2 Composant `MediaCard` — `index.html:32260-32410`

```javascript
const isClickable = !!onClick && !isSent;
```

| Propriété | Valeur si `isSent` | Valeur normale |
|-----------|-------------------|----------------|
| `opacity` | `0.4` | `1` |
| `filter` | `grayscale(1)` (100%) | `none` |
| `cursor` | `not-allowed` | `pointer` |
| `onClick` | bloqué | actif |
| Badge | `✓ Envoyé` (vert #10b981) | absent |

### 4.3 Composant galerie Broadcasting — `index.html:43233-43248`

| Propriété | Valeur si `isSent` |
|-----------|-------------------|
| `opacity` | `0.5` |
| `cursor` | `not-allowed` |
| Hover effect | désactivé |

### 4.4 Le clic est-il bloqué ?

**OUI**, dans tous les cas :
- `MediaPanelGrid` : `onClick={() => !isUsed && onSelect(item)}`
- `MediaCard` : `isClickable = !!onClick && !isSent`
- `LibraryModal` : `if (sentMediaIds.includes(media.id) || sentMediaUrls.includes(media.url)) return;`
- Broadcasting : `onClick={() => !isSent && setGalleryLightbox(media.url)}`

### 4.5 Tooltip/message

Pas de tooltip au sens HTML (`title="..."`). L'explication se fait via :
- **Overlay badge** sur le média : "📤 Envoyé" ou "💰 Vendu"
- **Badge vert** : "✓ Envoyé" (dans MediaCard)
- **Compteur sidebar** dans LibraryModal : "Envoyés: N"

---

## 5. Cross-model

### 5.1 Scénario : Carla envoie photo à SpenderX → conversation Bella avec SpenderX

#### Via `media_sends` (tracking par `chat_id`) :
- Carla-SpenderX a `chat_id = 111`
- Bella-SpenderX a `chat_id = 222`
- La photo **N'EST PAS grisée** dans la conversation Bella-SpenderX
- **BUG** : pas de cross-conversation

#### Via `sent_medias` (tracking par `spender_id + model_id`) :
- Le record est : `(media_url, spender_id=SpenderX, model_id=Carla)`
- Quand on ouvre Bella-SpenderX, le query est : `eq('spender_id', SpenderX).eq('model_id', Bella)`
- `model_id` est **différent** (Carla vs Bella)
- La photo **N'EST PAS grisée** non plus
- **C'est par design** : `sent_medias` est cross-conversation POUR LE MEME MODELE, pas cross-model

### 5.2 Le lookup se fait par :
- `media_sends` → `chat_id` (incorrect pour cross-conversation)
- `sent_medias` → `spender_id + model_id` (correct pour cross-conversation, MAIS pas cross-model)

### 5.3 Conclusion cross-model

**Aucun des deux systèmes ne grise cross-model.** Si on veut que Bella voie les photos envoyées par Carla au même spender, il faudrait :
- Soit retirer le filtre `model_id` de `getSentMediaUrls`
- Soit ajouter un query séparé sur `sent_medias WHERE spender_id = X` (sans filtre modèle)

---

## 6. Inventaire complet

### 6.1 Références `media_sends`

| Fichier | Ligne(s) | Code/Contexte | Actif ? |
|---------|----------|---------------|---------|
| `index.html` | 31748-31764 | `window._getSentMediaIds` — SELECT helper | ✅ Actif |
| `index.html` | 32424 | LibraryModal — charge sentMediaIds via `_getSentMediaIds` | ✅ Actif |
| `index.html` | 32509 | LibraryModal — INSERT après envoi | ✅ Actif |
| `index.html` | 36366-36368 | Grid Premium — SELECT media_sends | ✅ Actif |
| `index.html` | 36597 | Grid Premium — INSERT après envoi | ✅ Actif |
| `index.html` | 40223-40225 | DadashMessagerieTab — SELECT media_sends | ✅ Actif |
| `index.html` | 42330-42334 | DadashMessagerieTab — INSERT après envoi | ✅ Actif |
| `index.html` | 58760-58762 | GridConversationCell — SELECT media_sends | ✅ Actif |
| `index.html` | 58719 | GridConversationCell — INSERT après envoi | ✅ Actif |

### 6.2 Références `sent_medias`

| Fichier | Ligne(s) | Code/Contexte | Actif ? |
|---------|----------|---------------|---------|
| `index.html` | 31700-31705 | Commentaire section "SENT MEDIAS" | ✅ Actif |
| `index.html` | 31708-31722 | `markMediaAsSent` — UPSERT helper | ✅ Actif |
| `index.html` | 31728-31742 | `getSentMediaUrls` — SELECT helper | ✅ Actif |
| `index.html` | 31745-31746 | Global exports (`window._markMediaAsSent`, `window._getSentMediaUrls`) | ✅ Actif |
| `index.html` | 33146 | Grid Premium — charge sentMediaUrls | ✅ Actif |
| `index.html` | 33635 | Grid Premium — markMediaAsSent('grid') | ✅ Actif |
| `index.html` | 34584 | TlgPro — charge sentMediaUrls | ✅ Actif |
| `index.html` | 36153 | Tindada — markMediaAsSent('tindada') | ✅ Actif |
| `index.html` | 36377 | Tindada — charge sentMediaUrls | ✅ Actif |
| `index.html` | 36548 | TlgPro — markMediaAsSent('tlg_pro') | ✅ Actif |
| `index.html` | 36593 | TlgPro — markMediaAsSent('tlg_pro') | ✅ Actif |
| `index.html` | 36632 | TlgPro — markMediaAsSent('tlg_pro') | ✅ Actif |
| `index.html` | 40240 | DadashMessagerieTab — getSentMediaUrls | ✅ Actif |
| `migrations/20260315_sent_medias.sql` | 1-37 | DDL table + indexes + RLS | ✅ Actif |

### 6.3 Références `transactions.media_id` (contexte grisage)

| Fichier | Ligne(s) | Code/Contexte | Actif ? |
|---------|----------|---------------|---------|
| `index.html` | 36372-36373 | GridPremiumModal — SELECT transactions.media_id | ⚠️ Code actif mais NON-FONCTIONNEL (champ inexistant) |
| `index.html` | 40228-40230 | DadashMessagerieTab — SELECT transactions.media_id | ⚠️ Code actif mais NON-FONCTIONNEL |
| `index.html` | 58765-58767 | GridConversationCell — SELECT transactions.media_id | ⚠️ Code actif mais NON-FONCTIONNEL |

### 6.4 Références `isSent / isSold / isUsed / isMediaSent` (contexte galerie)

| Fichier | Ligne(s) | Variable | Contexte | Actif ? |
|---------|----------|----------|----------|---------|
| `index.html` | 32305 | `isClickable = !!onClick && !isSent` | MediaCard | ✅ Actif |
| `index.html` | 32316-32318 | `opacity: isSent ? 0.4 : 1` | MediaCard styles | ✅ Actif |
| `index.html` | 32389-32404 | Badge "✓ Envoyé" | MediaCard overlay | ✅ Actif |
| `index.html` | 32493 | `sentMediaIds.includes(media.id) \|\| sentMediaUrls.includes(media.url)` | LibraryModal click guard | ✅ Actif |
| `index.html` | 32584 | `isSent = sentMediaIds.includes(media.id) \|\| sentMediaUrls.includes(media.url)` | LibraryModal filter | ✅ Actif |
| `index.html` | 33569 | `isSent = sentMediaUrlsMap[...].includes(media.url)` | Grid Premium gallery | ✅ Actif |
| `index.html` | 35177 | `isSent = sentMediaUrlsMap[...].includes(media.url)` | TlgPro gallery | ✅ Actif |
| `index.html` | 36108 | `isSent = sentMediaUrls.includes(media.url)` | Tindada gallery | ✅ Actif |
| `index.html` | 39053 | `isSent = sentMediaIds.includes(item.id)` | MediaPanelGrid | ✅ Actif |
| `index.html` | 39054 | `isSold = soldMediaIds.includes(item.id)` | MediaPanelGrid | ⚠️ Toujours false |
| `index.html` | 39055 | `isUsed = isSent \|\| isSold` | MediaPanelGrid | ✅ Actif |
| `index.html` | 43233 | `isSent = sentMediaUrls.includes(media.url)` | Broadcasting gallery | ✅ Actif |
| `index.html` | 43237-43239 | `opacity: isSent ? 0.5 : 1` | Broadcasting styles | ✅ Actif |

### 6.5 Références `getSentMediaUrls / getSentMediaIds`

| Fichier | Ligne(s) | Fonction | Actif ? |
|---------|----------|----------|---------|
| `index.html` | 31728-31742 | Définition `getSentMediaUrls` | ✅ Actif |
| `index.html` | 31746 | Export `window._getSentMediaUrls` | ✅ Actif |
| `index.html` | 31748-31764 | Définition `window._getSentMediaIds` | ✅ Actif |
| `index.html` | 32424 | Appel `_getSentMediaIds(chatId)` | ✅ Actif |
| `index.html` | 33146 | Appel `_getSentMediaUrls(spenderId, modelId)` | ✅ Actif |
| `index.html` | 34584 | Appel `_getSentMediaUrls(spenderId, modelId)` | ✅ Actif |
| `index.html` | 36377 | Appel `_getSentMediaUrls(spenderId, modelId)` | ✅ Actif |
| `index.html` | 40240 | Appel `_getSentMediaUrls(spenderId, modelId)` | ✅ Actif |

### 6.6 State variables liées au grisage

| Fichier | Ligne(s) | Variable | Scope |
|---------|----------|----------|-------|
| `index.html` | 32418 | `sentMediaIds` | LibraryModal |
| `index.html` | 32749 | `sentMediaUrlsMap` | Grid Premium |
| `index.html` | 33968 | `sentMediaUrlsMap` | TlgPro |
| `index.html` | 35310 | `sentMediaUrls` | Tindada |
| `index.html` | 39416 | `sentMediaIds` | DadashMessagerieTab |
| `index.html` | 39417 | `soldMediaIds` | DadashMessagerieTab |
| `index.html` | 39418 | `sentMediaUrls` | DadashMessagerieTab |
| `index.html` | 58366 | `sentMediaIds` | GridConversationCell |

---

## Résumé des bugs et anomalies

| # | Sévérité | Description |
|---|----------|-------------|
| 1 | **P0** | `transactions.media_id` n'existe pas → `soldMediaIds` toujours vide → grisage "Vendu" ne fonctionne JAMAIS |
| 2 | **P1** | `media_sends` track par `chat_id` → pas de grisage cross-conversation pour le même spender |
| 3 | **P1** | `sent_medias` track par `spender_id + model_id` → pas de grisage cross-model |
| 4 | **P2** | `media_sends` n'a pas de migration versionnée dans le repo |
| 5 | **P2** | Incohérence d'identifiant : `media_sends` utilise `media_id` (UUID), `sent_medias` utilise `media_url` (TEXT) |
| 6 | **P3** | INSERT dans `media_sends` sont fire-and-forget (`.catch(() => {})`) — échecs silencieux |
| 7 | **P3** | RLS de `sent_medias` est full-open (`USING (true)`) — pas de sécurité row-level |
| 8 | **P3** | Styles de grisage incohérents entre composants (opacity 0.4 vs 0.45 vs 0.5, grayscale 60% vs 100%) |
