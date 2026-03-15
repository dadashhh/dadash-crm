# AUDIT — Route /#/grid-premium

**Date** : 15 mars 2026 — Session Claude Code
**Auditeur** : ALFRED (agent dev React/Supabase DADASH CRM)
**Fichier analysé** : `index.html` (single-page app, React 18.2.0 + Babel standalone)
**Composant principal** : `GridPremiumSubpage` (lignes 31321–31622)

---

> **CONFIGURATION MAX** : Grid Premium supporte jusqu'à **3×4 = 12 cellules simultanées**

---

## 1. FETCH HISTORIQUE

**Constat** : Messages chargés **individuellement par cellule** via l'API Carlos REST (`https://dadash-autofill-v2-production.up.railway.app`). 1 requête HTTP par slot actif. Ce n'est PAS Supabase directement — c'est un backend intermédiaire (Carlos API).

**Extrait de code** :
```javascript
// ligne 31361–31372
const gpLoadMsgs = React.useCallback(async (conv, idx, silent) => {
  if (!conv) return;
  const cid = _dmsgChatId(conv);
  if (!cid) return;
  if (!silent) setGpLoadingSlots(p => ({ ...p, [idx]: true }));
  try {
    const data = await _dmsgFetch("/conversations/" + cid + "/messages?limit=30", { timeout: 8000 });
    const msgs = Array.isArray(data) ? data : data.messages || data.data || [];
    setGpSlotMsgs(p => ({ ...p, [idx]: msgs }));
  } catch (_) {}
  setGpLoadingSlots(p => ({ ...p, [idx]: false }));
}, []);
```

**Détails** :
- **Endpoint** : `GET /conversations/{chat_id}/messages?limit=30`
- **Limite** : `?limit=30` — 30 messages max par cellule
- **Tri** : Côté client uniquement (render) — `.sort((a, b) => new Date(a.created_at || a.timestamp || 0) - new Date(b.created_at || b.timestamp || 0))` (ascending)
- **Moment du fetch** : Au mount (`useEffect` sur `gpSlots`) ET polling toutes les 30s (silent refresh)
- **Table** : N/A — API REST Carlos (pas Supabase directement). La table Supabase sous-jacente n'est pas visible dans ce composant.
- **Cache** : Un objet `_DMSG_MSG_CACHE` est défini au niveau global mais **non utilisé** dans `GridPremiumSubpage`.

**Note** : ⚠️ Limite de 30 messages par cellule — avec 12 cellules = 360 messages max en mémoire. Mais seuls les **12 derniers messages** sont affichés (`.slice(-12)`) — voir point 2.

---

## 2. SCROLL VERS LE HAUT

**Constat** : Chaque cellule possède son propre conteneur de scroll indépendant (`overflowY: "auto"`). **AUCUN scroll infini détecté** — chaque cellule charge un nombre fixe de messages (30 via API) et n'en affiche que les 12 derniers. Pas de mécanisme de pagination ni d'IntersectionObserver.

**Extrait de code** :
```javascript
// ligne 31497 — conteneur scroll de chaque slot
<div style={{ flex: 1, padding: "6px 8px", overflowY: "auto", fontSize: 11 }}
     className="grid-slot-scroller">

// ligne 31503 — rendu des messages : slice des 12 derniers uniquement
[...(gpSlotMsgs[idx] || [])]
  .sort((a, b) => new Date(a.created_at || a.timestamp || 0) - new Date(b.created_at || b.timestamp || 0))
  .slice(-12)   // ← SEULEMENT LES 12 DERNIERS MESSAGES AFFICHÉS
  .map((msg, mi) => { ... })
```

**Détails** :
- Conteneur de scroll : ✅ Indépendant par cellule (className `grid-slot-scroller`)
- Scroll infini : ❌ Absent
- IntersectionObserver : ❌ Absent
- onScroll event : ❌ Absent
- Auto-scroll vers le bas : ❌ Absent — aucun `scrollIntoView`, aucun `ref` sur le bas du conteneur

**Note** : ⚠️ Double limitation : 30 messages fetchés → seulement 12 affichés. L'historique complet est inaccessible depuis la Grid. Pas d'auto-scroll au chargement.

---

## 3. AFFICHAGE DATE/HEURE

**Constat** : Les messages dans les cellules n'affichent **aucun horodatage**. Seul le texte brut est rendu. Pas de séparateurs de jour. Pas de formatage de date.

**Extrait de code** :
```javascript
// ligne 31507–31511 — rendu d'un message dans la cellule
<div style={{ display: "inline-block", padding: "4px 8px",
  background: isOut ? "#6366f1" : "rgba(255,255,255,0.06)",
  color: isOut ? "#fff" : "#d1d5db", borderRadius: 7,
  maxWidth: "85%", fontSize: 10, lineHeight: 1.4, wordBreak: "break-word" }}>
  {_escapeHtml(msg.text || msg.content || msg.message || "[média]")}
</div>
```

**Détails** :
- `created_at` affiché : ❌ Absent
- Format actuel : Aucun — le champ `created_at` n'est utilisé que pour le **tri** (`.sort()`), jamais pour l'affichage
- Séparateurs de jour : ❌ Absents
- Librairie date (dayjs, date-fns) : ❌ Non utilisée dans ce composant
- Format condensé : N/A — aucun format du tout

**Note** : ❌ Problème détecté — l'horodatage est totalement absent des cellules. Impossible de savoir quand un message a été envoyé sans ouvrir la conversation complète.

---

## 4. EMOJIS RX/TX

**Constat** : Les emojis sont affichés normalement, sans traitement spécial. Le texte passe par `_escapeHtml()` qui utilise `textContent → innerHTML` (conversion HTML entities) — les emojis Unicode sont préservés tels quels.

**Extrait de code** :
```javascript
// ligne 31306–31310 — fonction _escapeHtml
const _escapeHtml = (text) => {
  const d = document.createElement("div");
  d.textContent = text;  // unicode emojis préservés
  return d.innerHTML;
};

// Rendu : {_escapeHtml(msg.text || msg.content || msg.message || "[média]")}
```

**Détails** :
- Regex de détection d'emojis isolés : ❌ Absent
- `font-size` différent pour emojis seuls : ❌ Absent
- Traitement spécial : ❌ Aucun

**Note** : ✅ OK — Emojis affichés normalement sans traitement spécial. Comportement acceptable pour une vue compacte.

---

## 5. APPELS

**Constat** : Aucun traitement spécifique pour les appels. Pas de détection de `message_type`, `is_call`, ou `call_duration`. Les appels (si présents dans les données) seraient affichés comme un message texte vide → fallback sur `"[média]"`.

**Extrait de code** :
```javascript
// ligne 31508 — seuls ces champs sont lus pour le contenu
{_escapeHtml(msg.text || msg.content || msg.message || "[média]")}
// Aucune vérification de : msg.message_type, msg.is_call, msg.call_duration
```

**Détails** :
- Colonne `message_type` : ❌ Non lue
- Colonne `is_call` : ❌ Non lue
- Colonne `call_duration` : ❌ Non lue
- Icône ou style spécifique appel : ❌ Absent

**Note** : ⚠️ Manquant — Aucun traitement spécifique pour les appels. Les appels apparaissent comme `[média]` ou vide.

---

## 6. MÉDIAS (PHOTO/VIDÉO)

**Constat** : Aucun rendu de médias. Le fallback `"[média]"` est affiché comme texte simple. Pas de `<img>`, `<video>`, thumbnail, ni modal.

**Extrait de code** :
```javascript
// ligne 31508 — fallback texte pour les médias
{_escapeHtml(msg.text || msg.content || msg.message || "[média]")}
// Si msg.text === null ou "" et qu'il y a une photo → affiche "[média]"
// Pas de lecture de : msg.media_url, msg.photo_url, msg.video_url
```

**Détails** :
- Colonnes `media_url` / `photo_url` / `video_url` : ❌ Non lues
- `<img>` thumbnail : ❌ Absent
- `<video>` player : ❌ Absent
- Modal plein écran (MediaModal, ImageViewer) : ❌ Absent

**Note** : ❌ Problème détecté — Aucun affichage de médias. Les photos/vidéos reçues apparaissent toutes comme `[média]` en texte.

---

## 7. LAYOUT GRID

**Constat** : 4 layouts disponibles (2×2, 2×3, 3×3, 3×4). Le sélecteur est visible en haut à droite du header. Maximum **12 cellules simultanées** confirmé (3×4). ⚠️ Pas de layout 1×1.

**Extrait de code** :
```javascript
// ligne 31315 — constante partagée Grid Premium + TLG Pro
const GRID_LAYOUTS = {
  "2x2": { cols: 2, slots: 4  },
  "2x3": { cols: 3, slots: 6  },
  "3x3": { cols: 3, slots: 9  },
  "3x4": { cols: 4, slots: 12 }
};

// ligne 31471 — rendu CSS grid
<div style={{
  flex: "0 0 68%",
  display: "grid",
  gridTemplateColumns: `repeat(${gpLayoutCfg.cols}, 1fr)`,
  gap: 8,
  overflow: "auto"
}}>
```

**Détails** :
- Layouts disponibles : 4 (pas de 1×1 contrairement à la spec initiale)
- Layout par défaut : `"2x3"` (6 slots)
- Max cellules simultanées : **12 (3×4)** ✅ confirmé
- Header par cellule : ✅ tier emoji + nom spender + montant CHF
- Boutons par cellule : ❌ Pas de boutons Scripts/Médias/TX **dans** chaque cellule — il y a un seul panneau input commun à droite (30% width)
- Input message : ⚠️ **PARTAGÉ** — un seul input pour la cellule active (pas d'input individuel par cellule)

**Note** : ✅ Système de layout fonctionnel, 12 cellules max confirmé — mais ⚠️ l'input est partagé (un seul actif à la fois), contrairement à TlgProSubpage qui a un input par slot.

---

## 8. STRUCTURE DU COMPOSANT

**Constat** : Composant unique `GridPremiumSubpage` — tout inline, sans sous-composants. Pas de Supabase Realtime (polling uniquement).

**Extrait de code** :
```javascript
// ligne 31321 — signature du composant
const GridPremiumSubpage = ({ conversations = [], convTotalsMap = {}, models = [], lang, user, onSelectConv }) => {
  const [gpLayout, setGpLayout]             = useState("2x3");
  const [gpModelFilter, setGpModelFilter]   = useState("all");
  const [gpSlots, setGpSlots]               = useState([]);       // array de convs actives
  const [gpSlotMsgs, setGpSlotMsgs]         = useState({});       // { idx: messages[] }
  const [gpLoadingSlots, setGpLoadingSlots] = useState({});       // { idx: boolean }
  const [gpActiveSlot, setGpActiveSlot]     = useState(null);     // index slot actif
  const [gpMsgInput, setGpMsgInput]         = useState("");       // input partagé
  const [gpSending, setGpSending]           = useState(false);
  const [gpShowScripts, setGpShowScripts]   = useState(false);
  const gpRefreshRef = React.useRef(null);  // ref pour le setInterval de polling
```

**Détails** :
- Nom composant principal : `GridPremiumSubpage` ✅
- Sous-composants (GridCell, MessageBubble…) : ❌ Absents — tout est inline dans le return JSX
- États React : `gpLayout`, `gpModelFilter`, `gpSlots[]`, `gpSlotMsgs{}`, `gpLoadingSlots{}`, `gpActiveSlot`, `gpMsgInput`, `gpSending`, `gpShowScripts`
- Hook Supabase Realtime (`.on('INSERT')`) : ❌ Absent dans ce composant
- Gestion 12 cellules : `gpSlots` array de longueur `gpLayoutCfg.slots` (max 12), rendu par `.map()`

**Note** : ⚠️ Architecture monolithique — tout le rendu est inline dans un seul composant. Rend la maintenance difficile mais fonctionne.

---

## 9. PERFORMANCE

**Constat** : Pas de virtualisation, très peu de memoization. Charge réelle : 30 messages fetchés par cellule, 12 affichés. Avec 12 cellules actives : 360 messages en state, 144 renderisés.

**Extrait de code** :
```javascript
// Seule memoization présente : liste conversations triées
const gpUnreadSorted = React.useMemo(() => {
  let pool = conversations.filter(c => c.unread_count && c.unread_count > 0);
  // ... filtrage et tri
  return pool;
}, [conversations, gpModelFilter, models, convTotalsMap]);

// Aucun React.memo sur les cellules
// Aucune virtualisation (react-window, react-virtuoso)
// Limite affichage : .slice(-12) sur les messages
```

**Détails** :
- Virtualisation (react-window, react-virtuoso) : ❌ Absente
- React.memo sur cellules : ❌ Absent
- useMemo sur messages : ❌ Absent (uniquement sur `gpUnreadSorted`)
- Messages fetchés par cellule : 30 (via `?limit=30`)
- Messages affichés par cellule : 12 (via `.slice(-12)`)
- Charge max estimée : 12 cellules × 30 messages = **360 messages en state** / 12 × 12 = **144 éléments DOM rendus**
- Lazy load des cellules non visibles : ❌ Absent

**Note** : ✅ OK pour la charge actuelle (144 éléments DOM) — pas de problème de performance critique avec les limites en place. ⚠️ Si `.slice(-12)` était retiré, les 360 messages seraient tous rendus simultanément.

---

## 10. TEMPS RÉEL ET SYNCHRONISATION

**Constat** : Synchronisation par **polling toutes les 30 secondes** uniquement. Pas de Supabase Realtime pour les cellules Grid Premium. Après envoi d'un message, rechargement silencieux du slot actif après 800ms.

**Extrait de code** :
```javascript
// ligne 31378–31384 — polling toutes les 30s
useEffect(() => {
  if (gpRefreshRef.current) clearInterval(gpRefreshRef.current);
  gpRefreshRef.current = setInterval(() => {
    gpSlots.forEach((c, i) => { if (c) gpLoadMsgs(c, i, true); }); // silent=true
  }, GRID_REFRESH_MS); // 30 000 ms
  return () => { if (gpRefreshRef.current) clearInterval(gpRefreshRef.current); };
}, [gpSlots, gpLoadMsgs]);

// ligne 31414 — après envoi, rechargement du slot actif uniquement
setTimeout(() => gpLoadMsgs(activeConv, gpActiveSlot, true), 800);
```

**Détails** :
- Polling : ✅ `setInterval` toutes les 30s (`GRID_REFRESH_MS = 30000`)
- Supabase Realtime (`.on('INSERT')`) : ❌ Absent dans `GridPremiumSubpage` (présent dans d'autres composants ex. ligne 29789)
- Socket.io (`socket.on`) : ❌ Absent dans ce composant
- Auto-scroll bas après nouveau message : ❌ Absent — aucun `scrollIntoView`, aucun ref de scroll
- Rechargement après envoi : ⚠️ Uniquement le slot actif (`gpActiveSlot`), pas tous les slots

**Note** : ⚠️ Polling 30s = latence maximale de 30s pour les nouveaux messages. Pas d'auto-scroll après réception. Les autres slots ne se rechargent pas après un envoi.

---

## RÉSUMÉ EXÉCUTIF

| # | Point | Statut |
|---|-------|--------|
| 1 | Fetch historique | ⚠️ Limite 30 msg/cellule, Carlos API REST, individuel par slot |
| 2 | Scroll vers le haut | ❌ Aucun scroll infini — seulement 12 derniers messages affichés, pas d'auto-scroll |
| 3 | Affichage date/heure | ❌ Totalement absent — ni horodatage ni séparateurs de jour |
| 4 | Emojis RX/TX | ✅ Affichés normalement, aucun traitement spécial |
| 5 | Appels | ⚠️ Aucun traitement — appels affichés comme `[média]` |
| 6 | Médias (photo/vidéo) | ❌ Aucun rendu — tout affiché comme `[média]` texte |
| 7 | Layout Grid | ✅ 4 layouts, 12 cellules max confirmé — ⚠️ input partagé (pas 1 input/cellule) |
| 8 | Structure composant | ⚠️ Monolithique inline — pas de sous-composants |
| 9 | Performance | ✅ Acceptable (144 éléments DOM max) — aucune virtualisation |
| 10 | Temps réel & synchro | ⚠️ Polling 30s uniquement — pas de Supabase Realtime, pas d'auto-scroll |

### Comptage
- **Points OK (✅)** : 2/10 (emojis, performance basique)
- **Points manquants/améliorables (⚠️)** : 4/10 (fetch limite, layout input partagé, structure, polling)
- **Problèmes critiques (❌)** : 4/10 (scroll/historique tronqué, date/heure, appels non gérés, médias non rendus)

### Charge maximale estimée
- 12 cellules × 30 messages fetchés = **360 messages en state**
- 12 cellules × 12 messages affichés = **144 éléments DOM rendus**

### Points forts actuels
- Système de layout grid fonctionnel et fluide (4 layouts, CSS grid natif)
- Polling silent (n'écrase pas l'état de sélection)
- Header par cellule avec tier emoji + nom + CHF
- Scripts intégrés dans le panneau input

### Points à implémenter (sans toucher au layout grid)
1. **Historique complet** : Scroll infini vers le haut par cellule (IntersectionObserver + pagination offset)
2. **Date/heure** : Ajouter horodatage condensé (`HH:mm`) sous chaque message + séparateurs de jour
3. **Médias** : Lire `media_url`/`photo_url` et afficher thumbnails `<img>` + modal plein écran partagé
4. **Appels** : Détecter `message_type === "call"` et afficher icône 📞 + durée
5. **Auto-scroll** : `scrollIntoView` sur le dernier message au chargement et à la réception
6. **Supabase Realtime** : Remplacer/compléter le polling par `.on('postgres_changes', {event: 'INSERT'})` pour réactivité immédiate

**Prochaine étape** : PR de modifications pour implémenter historique complet + date/heure + médias + appels par cellule **SANS TOUCHER au système de layout grid** (`GRID_LAYOUTS`, `gpLayout`, `gpLayoutCfg`, CSS grid).
