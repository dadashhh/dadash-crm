# AUDIT ALFRED — Affichage Médias dans les Conversations

**Date :** 2026-03-18
**Branche :** `claude/audit-media-display-VOWt5`
**Scope :** Audit uniquement — aucune modification de code

---

## PARTIE 1 — Comment les médias sont censés s'afficher

### 1.1 Réception des messages

Quand le front fetch `GET /conversations/{chat_id}/messages?limit=50&offset=0` via Carlos API (`_dmsgFetch`, ligne 39847), la réponse est un tableau JSON de messages.

**Champs média attendus dans la réponse :**
| Champ | Usage | Présent dans tg_messages (Supabase) ? |
|-------|-------|---------------------------------------|
| `media_url` | URL principale du média | **NON** — pas de colonne dédiée |
| `photo_url` | URL fallback photo | **NON** |
| `file_url` | URL fallback fichier | **NON** |
| `media_type` | Type : "photo", "video", "image", "document", "audio", "voice" | **NON** |
| `type` | Fallback pour media_type | **NON** |

**Point critique :** La table `tg_messages` (migration `20260225`) ne contient que : `id`, `conversation_id`, `direction`, `text`, `tg_message_id`, `sender_profile_id`, `created_at`, `meta` (jsonb). **Il n'y a aucune colonne `media_url` ni `media_type`.**

Ces champs doivent venir soit :
- Du Carlos API qui les ajoute à la réponse (depuis Telegram)
- Du champ `meta` JSONB (mais le code ne lit pas `msg.meta.media_url`)

**Fallback Supabase** (ligne 39908) : Quand Carlos échoue, le code fait `sb.from("tg_messages").select("*")`. Ce fallback ne peut **jamais** retourner de `media_url`/`media_type` car ces colonnes n'existent pas dans la table.

### 1.2 Rendu dans le chat

**Composant :** Rendu inline dans `DadashMessagerieTab` via un `.map()` sur le tableau `messages`.
**Fichier :** `index.html`, lignes 42022-42130

**Détection média** (lignes 42032-42041) :
```javascript
const mediaUrl  = msg.media_url || msg.photo_url || msg.file_url || null;
const rawType   = msg.media_type || msg.type || null;
const mediaType = !mediaUrl ? null
  : (rawType === "photo" || rawType === "image") ? "image"
  : rawType === "video" ? "video"
  : (rawType === "document" || rawType === "audio" || rawType === "voice") ? "document"
  : mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? "image"
  : mediaUrl.match(/\.(mp4|mov|webm)(\?|$)/i) ? "video"
  : null;
const hasMedia = !!mediaType;
```

**Logique :** Si `media_url` (ou `photo_url` ou `file_url`) est truthy ET qu'un type est déterminable → le média est affiché. Sinon → message texte seulement.

### 1.3 Affichage de l'image

**Balise :** `<img>` (ligne 42080-42087)
```jsx
<img src={mediaUrl} alt="" loading="lazy"
  onLoad={e => { e.target.style.opacity = "1"; }}
  onClick={() => setLightboxUrl(mediaUrl)}
  style={{ display: "block", width: "100%", maxWidth: 320, height: "auto",
           opacity: 0, transition: "opacity 0.3s", cursor: "zoom-in" }} />
```
- **Source URL :** Valeur directe de `msg.media_url` (URL Supabase Storage, Telegram, ou Carlos proxy)
- **Lazy loading :** oui
- **Click :** Ouvre un lightbox plein écran
- **Animation :** Fade-in de opacity 0→1 au chargement

### 1.4 Affichage de la vidéo

**Balise :** `<video>` (lignes 42090-42097)
```jsx
<video src={mediaUrl} controls preload="metadata"
  style={{ display: "block", width: "100%", maxWidth: 320, height: "auto" }} />
```
- **Player inline :** Oui, avec contrôles natifs HTML5
- **Preload :** metadata seulement (pas de téléchargement complet)
- **Source URL :** Même `mediaUrl` que les images

**Documents/Audio :** Lien `<a>` avec icône 📎 et nom de fichier extrait de l'URL (lignes 42099-42107)

---

## PARTIE 2 — Diagnostic de la panne

### 2.1 Cause racine identifiée

**Le problème est double :**

#### A) Carlos API ne retourne pas `media_url`/`media_type`

La table `tg_messages` n'a pas de colonnes `media_url` ou `media_type`. L'API Carlos fetch les messages depuis cette table. Si Carlos n'enrichit pas la réponse avec les données média de Telegram, les champs `media_url` et `media_type` seront `undefined` dans le JSON → le code de détection (ligne 42032) donne `mediaUrl = null` → aucun média affiché.

**Action requise :** Vérifier côté Carlos si l'endpoint `/conversations/{id}/messages` ajoute les champs média à la réponse. Si non, c'est la cause principale.

#### B) Le revert a supprimé le mécanisme `_keepMedia`

Le revert (commit `0ebe1c9`, PR #940) a rollback 22 commits dont 3 directement liés aux médias :

| Commit reverté | Ce qu'il faisait |
|----------------|------------------|
| `ea0ec7f` (PR #932) | **`_keepMedia` timestamp** — Après envoi d'un média, ajoutait `_keepMedia: Date.now() + 15000` au message optimiste. Pendant 15s, `mergeMessages()` préservait ce message au lieu de le remplacer par la version Carlos (qui n'a pas de `media_url`). |
| `8569ed9` (PR #924) | **Affichage media pour tous les messages** — Dans TindadaInboxZeroPage, changeait `isPending && msg.media_url` en juste `msg.media_url` pour montrer les médias même après confirmation. |
| `2e1bf7a` (PR #921) | **Cross-page grisage** — Ajoutait `_markMediaAsSent` dans LibraryModal + GridConversationCell pour le suivi cross-page des médias envoyés. |

#### C) `mergeMessages()` écrase les médias optimistes

La fonction `mergeMessages` (ligne 32161-32183) ne conserve que les messages avec `_pending` ou `_error` :
```javascript
const localOnly = prev.filter(m =>
  (m._pending || m._error) &&
  !serverIds.has(_msgKey(m)) &&
  !serverTexts.has((m.text || "").trim())
);
```

Sans `_keepMedia`, dès que le message n'est plus `_pending`, il est remplacé par la version serveur. Si la version serveur n'a pas `media_url` → le média disparaît.

**Chronologie du bug pour un envoi de média :**
1. User envoie un média → message optimiste créé avec `media_url` + `_pending: true` → média visible ✅
2. Carlos confirme l'envoi → `_pending` retiré → média toujours visible (car pas encore re-fetch) ✅
3. Poll/refresh des messages → `mergeMessages()` remplace le message optimiste par la version Carlos → `media_url` absent → média disparu ❌

### 2.2 Messages reçus (incoming)

Pour les messages **reçus**, si Carlos ne renvoie pas `media_url`/`media_type` dans la réponse de `/conversations/{id}/messages`, les médias reçus ne s'afficheront **jamais**. Il n'y a pas de message optimiste pour les messages entrants — ils viennent uniquement du serveur.

### 2.3 Fallback Supabase

Quand Carlos échoue (timeout, erreur réseau), le code fallback fait un `SELECT *` sur `tg_messages` (ligne 39908). Cette table n'a pas de colonnes média → **aucun média ne s'affiche en mode fallback non plus**.

### 2.4 Le champ `meta` JSONB

Le champ `meta` de `tg_messages` pourrait contenir des infos média, mais le code de rendu (ligne 42032) ne regarde **pas** `msg.meta.media_url` ni `msg.meta.media_type`. Il cherche directement `msg.media_url`.

---

## PARTIE 3 — Inventaire complet des références média

### `media_type`

| Fichier | Ligne(s) | Code | Actif ? |
|---------|----------|------|---------|
| index.html | 33609 | Optimistic msg: `media_type: media.type` | ✅ Actif |
| index.html | 35946 | Render condition: `msg.media_type === "video"` | ✅ Actif |
| index.html | 36126 | Optimistic msg: `media_type: media.type` | ✅ Actif |
| index.html | 36566 | Optimistic msg: `media_type: item.type` | ✅ Actif |
| index.html | 37713 | Broadcast creation: `media_type: broadcastMedia?.type` | ✅ Actif |
| index.html | 37825 | Broadcast model: `media_type: broadcastMedia?.type` | ✅ Actif |
| index.html | 38284 | Broadcast history: `b.media_type === "photo"` | ✅ Actif |
| index.html | 38353 | Broadcast campaign: `bc.metadata?.media_type === "photo"` | ✅ Actif |
| index.html | 41356 | Manual broadcast: `media_type: broadcastMedia?.type` | ✅ Actif |
| index.html | 42033 | **Détection média chat :** `msg.media_type \|\| msg.type` | ✅ Actif |
| index.html | 42272 | Pending media: `media_type: pendingMedia.type` | ✅ Actif |
| index.html | 43270 | Message send: `media_type: media.type` | ✅ Actif |
| index.html | 46640 | Broadcast summary: `b.media_type === 'photo'` | ✅ Actif |
| index.html | 52494 | Claude API: `media_type: mediaType` (base64 image) | ✅ Actif |
| index.html | 58218 | IA detection: `message.media_type === 'photo'` | ✅ Actif |
| index.html | 58659 | Pending media: `media_type: pendingMedia.type === "video" ? "video" : "photo"` | ✅ Actif |
| index.html | 58899 | Détection média: `msg.media_type \|\| msg.type` | ✅ Actif |
| supabase/migrations/20260305_broadcast_history.sql | 10 | Colonne DB: `media_type TEXT` | ✅ Actif |

### `media_url`

| Fichier | Ligne(s) | Code | Actif ? |
|---------|----------|------|---------|
| index.html | 8500 | Script step defaults: `media_url: null` | ✅ Actif |
| index.html | 31205 | Send voice: `audio_url: script.media_url` | ✅ Actif |
| index.html | 31209 | Get video metadata: `window._getVideoMetadata(script.media_url)` | ✅ Actif |
| index.html | 31212 | Send video: `video_url: script.media_url` | ✅ Actif |
| index.html | 33609 | Optimistic msg: `media_url: media.url` | ✅ Actif |
| index.html | 35944-35948 | Render pending media: condition sur `msg.media_url` | ✅ Actif |
| index.html | 36126 | Optimistic msg: `media_url: media.url` | ✅ Actif |
| index.html | 36566 | Optimistic msg: `media_url: item.url` | ✅ Actif |
| index.html | 42032 | **Détection média chat :** `msg.media_url \|\| msg.photo_url \|\| msg.file_url` | ✅ Actif |
| index.html | 42273 | Pending media: `media_url: pendingMedia.url` | ✅ Actif |
| index.html | 43270 | Message creation: `media_url: media.url` | ✅ Actif |
| index.html | 58218 | IA detection: `message.media_type === 'photo' && message.media_url` | ✅ Actif |
| index.html | 58659 | Pending msg: `media_url: pendingMedia.url` | ✅ Actif |
| index.html | 58679 | Message update: `media_url: mediaUrl` | ✅ Actif |
| index.html | 58898 | Détection média: `msg.media_url \|\| msg.photo_url \|\| msg.file_url` | ✅ Actif |
| migrations/20260228_scripts_chatter_restrictions.sql | 15 | Colonne DB: `media_url TEXT` (table scripts) | ✅ Actif |
| migrations/20260315_sent_medias.sql | 7, 12 | Colonne DB: `media_url TEXT NOT NULL` + UNIQUE | ✅ Actif |

### `media_path`

**Aucune référence dans le codebase.** Ce terme n'est pas utilisé.

### `media_id`

| Fichier | Ligne(s) | Code | Actif ? |
|---------|----------|------|---------|
| index.html | 31754 | Query: `.select('media_id')` from media_sends | ✅ Actif |
| index.html | 31757 | Map: `.map(r => r.media_id)` | ✅ Actif |
| index.html | 36359-36360 | Query transactions: `.select("media_id")` + map | ✅ Actif |
| index.html | 40209-40210 | Query transactions: `.select("media_id")` + map | ✅ Actif |
| index.html | 42304 | Insert media_sends: `media_id: pendingMedia.id` | ✅ Actif |
| index.html | 44650 | Script: `in('id', script.media_ids)` | ✅ Actif |
| index.html | 44726 | Script update: `media_ids: scriptMedias.map(m => m.id)` | ✅ Actif |
| index.html | 44933 | Step update: `media_ids: updated.map(m => m.id)` | ✅ Actif |
| index.html | 45103 | Step picker: `media_ids: updated.map(m => m.id)` | ✅ Actif |
| index.html | 58681 | Insert media_sends: `media_id: pendingMedia.id` | ✅ Actif |
| index.html | 58722-58723 | Query + map media_sends | ✅ Actif |
| index.html | 58727-58728 | Query + map transactions | ✅ Actif |

### `<img>` (contexte messagerie)

| Fichier | Ligne(s) | Code | Actif ? |
|---------|----------|------|---------|
| index.html | 42080-42087 | **Chat bubble image :** `<img src={mediaUrl} ...>` | ✅ Actif |
| index.html | 35944-35948 | TindadaInboxZero: `<img src={msg.media_url}>` (conditionné à `isPending`) | ✅ Actif |
| index.html | 39038+ | MediaPanelGrid: `<img src={item.url}>` (sélecteur média) | ✅ Actif |

### `<video>` (contexte messagerie)

| Fichier | Ligne(s) | Code | Actif ? |
|---------|----------|------|---------|
| index.html | 42090-42097 | **Chat bubble video :** `<video src={mediaUrl} controls>` | ✅ Actif |
| index.html | 35946 | TindadaInboxZero: `<video src={msg.media_url}>` (conditionné) | ✅ Actif |
| index.html | 39038+ | MediaPanelGrid: `<video>` avec overlay play/duration | ✅ Actif |

### `media_library`

| Fichier | Ligne(s) | Code | Actif ? |
|---------|----------|------|---------|
| index.html | 32421 | Query: `sb.from('media_library').select('*')` | ✅ Actif |
| index.html | 38973 | Query: `sb.from("media_library").select("*").eq("type", mediaType)` | ✅ Actif |
| index.html | 40196 | Query: `sb.from("media_library").select("*").order(...)` | ✅ Actif |
| index.html | 42970 | Update usage_count | ✅ Actif |
| index.html | 44651 | Query by script media_ids | ✅ Actif |
| index.html | 44659 | Query all ordered by created_at | ✅ Actif |
| index.html | 45360 | Update album_id | ✅ Actif |
| index.html | 45375 | Query all ordered | ✅ Actif |
| index.html | 45427 | Insert new media | ✅ Actif |
| index.html | 45449 | Delete media | ✅ Actif |
| index.html | 45962-46121 | CRUD operations (update, query, insert, delete) | ✅ Actif |
| supabase/migrations/20260305_media_library.sql | 1-31 | Table + RLS | ✅ Actif |
| supabase/migrations/20260316_media_library_fix.sql | 13-37 | Colonnes ajoutées + RLS fix | ✅ Actif |

### `media_sends`

| Fichier | Ligne(s) | Code | Actif ? |
|---------|----------|------|---------|
| index.html | 31748-31757 | Query media_ids envoyés pour un chat_id | ✅ Actif |
| index.html | 32493-32496 | Insert fire-and-forget après envoi | ✅ Actif |
| index.html | 36353-36584 | Query + insert (Grid Premium) | ✅ Actif |
| index.html | 40204-40206 | Query (DadashMessagerieTab) | ✅ Actif |
| index.html | 42303 | Insert après envoi (DadashMessagerieTab) | ✅ Actif |
| index.html | 58681-58722 | Insert + Query (autre contexte) | ✅ Actif |

**Note :** Migration de création de la table `media_sends` non trouvée dans le repo. La table existe en prod mais sa DDL n'est pas versionnée ici.

### `sent_medias`

| Fichier | Ligne(s) | Code | Actif ? |
|---------|----------|------|---------|
| index.html | 31700 | Comment: "SENT MEDIAS — Helpers cross-pages" | ✅ Actif |
| index.html | 31711-31713 | Upsert dans sent_medias | ✅ Actif |
| index.html | 31732 | Query sent_medias par spender | ✅ Actif |
| index.html | 40217 | Charger URLs envoyées cross-pages | ✅ Actif |
| migrations/20260315_sent_medias.sql | 1-37 | Table + RLS + UNIQUE constraint | ✅ Actif |

---

## CONCLUSION & RÉSUMÉ

### Diagnostic principal

**Les médias ne s'affichent plus pour 2 raisons interconnectées :**

1. **La table `tg_messages` n'a pas de colonnes `media_url`/`media_type`.** Ces informations doivent venir de l'API Carlos, qui doit les extraire de Telegram lors du fetch. Si Carlos ne les inclut pas dans sa réponse JSON, le front n'a aucun moyen de savoir qu'un message contient un média.

2. **Le mécanisme `_keepMedia` a été reverté.** Même quand un média est envoyé avec succès (message optimiste avec `media_url`), la réconciliation avec la réponse serveur (`mergeMessages`) écrase le message optimiste par la version serveur qui n'a pas `media_url`. Sans `_keepMedia`, le média disparaît après le premier refresh/poll.

### Impact par scénario

| Scénario | Résultat | Pourquoi |
|----------|----------|----------|
| Média **envoyé** — avant refresh | ✅ Visible | Message optimiste a `media_url` + `_pending` |
| Média **envoyé** — après refresh | ❌ Disparu | `mergeMessages` remplace par version serveur sans `media_url` |
| Média **reçu** | ❌ Jamais visible | Vient uniquement du serveur, pas de `media_url` dans la réponse |
| Fallback Supabase | ❌ Jamais visible | `tg_messages` n'a pas de colonne `media_url` |

### Actions recommandées (à implémenter, pas dans cet audit)

1. **Vérifier Carlos API** — L'endpoint `/conversations/{id}/messages` retourne-t-il `media_url` et `media_type` ? Si non, c'est le fix prioritaire côté backend.
2. **Réintroduire `_keepMedia`** — Le mécanisme de préservation des médias optimistes pendant la réconciliation doit être restauré.
3. **Considérer l'ajout de colonnes** — Ajouter `media_url TEXT` et `media_type TEXT` à `tg_messages` pour persister les médias côté base de données.
4. **Extraire du `meta` JSONB** — Alternativement, si les médias sont stockés dans `meta`, le code frontend devrait lire `msg.meta?.media_url` en fallback.

---

*Audit réalisé le 2026-03-18. Aucune modification de code effectuée.*
