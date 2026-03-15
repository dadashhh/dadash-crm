# AUDIT — Route /#/messagerie-tlg-pro

**Date** : 15 mars 2026 — 18h00 UTC
**Auditeur** : ALFRED (Claude Sonnet 4.6)
**Fichier analysé** : `index.html` (58 495 lignes — single-file React app, Babel standalone)

> ⚠️ **Note route** : L'URL réelle est `/#/messagerie-tlg-pro` (pas `/#/tlg-pro`).
> Alias défini ligne 56275 : `hash === "/messagerie-tlg-pro" || hash === "messagerie-tlg-pro"`.

---

**CONFIGURATION MAX : 3×4 = 12 cellules simultanées + IA Venice (Carlos API)**

---

## 1. FETCH HISTORIQUE

**Constat** : Messages chargés **individuellement par cellule** via la fonction `tLoadMsgs()` appelant Carlos API. Chaque cellule lance sa propre requête. La table Supabase `messages`/`telegram_messages` n'est **pas interrogée directement** — toutes les lectures passent par l'API Carlos intermédiaire.

**Détails** :
- **API** : `https://dadash-autofill-v2-production.up.railway.app`
- **Endpoint** : `GET /conversations/{chat_id}/messages?limit=30`
- **Limite** : `30` messages par cellule
- **Affichage** : seulement les **12 derniers** sont rendus (`slice(-12)`)
- **Tri** : croissant par `created_at` (`.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))`)
- **Fetch au mount** : oui — `useEffect` sur `tSlots` (ligne 32204)

**Extrait de code** :
```javascript
// ligne 32191-32202
const tLoadMsgs = React.useCallback(async (conv, idx, silent) => {
  if (!conv) return;
  const cid = _dmsgChatId(conv);
  if (!cid) return;
  if (!silent) setTLoadingSlots(p => ({ ...p, [idx]: true }));
  try {
    const data = await _dmsgFetch("/conversations/" + cid + "/messages?limit=30", { timeout: 8000 });
    const msgs = Array.isArray(data) ? data : data.messages || data.data || [];
    setTSlotMsgs(p => ({ ...p, [idx]: msgs }));
  } catch (_) {}
  setTLoadingSlots(p => ({ ...p, [idx]: false }));
}, []);

// Affichage — ligne 32429
[...(tSlotMsgs[idx] || [])].sort(...).slice(-12).map((msg, mi) => { ... })
```

**Note** : ⚠️ Limite de 30 messages chargés, 12 affichés. Aucune pagination. La table source côté Carlos n'est pas identifiable depuis le front.

---

## 2. SCROLL VERS LE HAUT

**Constat** : Chaque cellule possède son **propre conteneur de scroll indépendant** (`data-tlg-slot={idx}`). Il n'y a **aucun scroll infini** dans TLG Pro — c'est une différence majeure avec Grid Premium.

**Détails** :
- Chaque cellule : `<div data-tlg-slot={idx} style={{ overflowY: "auto" }}>` (ligne 32423)
- Scroll automatique vers le **bas** après chargement (ligne 32217-32221)
- **AUCUN IntersectionObserver** dans TLG Pro (la sentinelle existe dans Grid Premium uniquement, lignes 31494-31510)

**Extrait de code** :
```javascript
// Scroll auto vers le bas — ligne 32216-32221
useEffect(() => {
  Object.keys(tSlotMsgs).forEach(idx => {
    const el = document.querySelector(`[data-tlg-slot="${idx}"]`);
    if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 80);
  });
}, [tSlotMsgs]);
```

**Note** : ⚠️ AUCUN scroll infini détecté. Impossible de charger des messages plus anciens depuis chaque cellule TLG Pro. (Grid Premium a IntersectionObserver + `loadMore` avec `limit=200` + pagination.)

---

## 3. AFFICHAGE DATE/HEURE

**Constat** : Les bulles de messages dans TLG Pro **n'affichent pas de date/heure**. Le champ `created_at` est utilisé uniquement pour le tri, pas pour l'affichage. Aucun séparateur de jour.

**Détails** :
- Rendu message : `_escapeHtml(msg.text || msg.content || msg.message || "[média]")` — pas de timestamp (ligne 32434)
- La fonction `tTimeAgo()` existe (lignes 32267-32281) mais est utilisée **uniquement dans le picker de conversations** (liste de sélection), pas dans les bulles
- Aucune librairie date (dayjs, date-fns) utilisée

**Extrait de code** :
```javascript
// Rendu bulle — ligne 32432-32438
<div key={mi} style={{ marginBottom: 3, textAlign: isOut ? "right" : "left" }}>
  <div style={{ display: "inline-block", padding: "4px 8px",
    background: isOut ? "#6366f1" : "rgba(255,255,255,0.06)",
    color: isOut ? "#fff" : "#d1d5db", borderRadius: 7, maxWidth: "85%",
    fontSize: 10, lineHeight: 1.4, wordBreak: "break-word" }}>
    {_escapeHtml(msg.text || msg.content || msg.message || "[média]")}
  </div>
</div>
```

**Note** : ❌ Aucune date/heure dans les bulles. Aucun séparateur "Aujourd'hui"/"Hier". Les messages sont anonymisés temporellement pour le chatter.

---

## 4. EMOJIS RX/TX

**Constat** : Les emojis dans le corps des messages sont affichés normalement (via `_escapeHtml` qui échappe le HTML mais laisse passer les caractères Unicode). Aucun traitement spécial pour les emojis isolés.

**Système quick-reply (emoji panel)** :
- **Position** : popup inline **en bas de chaque cellule**, s'affiche au-dessus de l'input (maxHeight 200px, `overflowY: auto`)
- **Déclencheur** : bouton 😊 dans la toolbar de chaque cellule
- **Au clic sur un emoji** : **insertion dans l'input** + fermeture du popup (pas d'envoi direct)
- **Même palette pour toutes les cellules** : 30 emojis hardcodés identiques

**Extrait de code** :
```javascript
// Emoji picker — ligne 32460-32470
{tPopup[idx] === "emoji" && (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 3 }}>
    {["😊","😘","🥰","😍","🔥","💋","👅","🍑","🍆","💦","😈","😏","🤤",
      "🥴","💕","💖","❤️","🖤","💜","💙","👀","😳","🙈","🙊","😇","🤭",
      "🫦","💅","🎁","⭐"].map((em, ei) => (
      <button key={ei} onClick={() => {
        setTInputs(p => ({ ...p, [idx]: (p[idx] || "") + em }));
        setTPopup(p => ({ ...p, [idx]: null }));
      }} ...>{em}</button>
    ))}
  </div>
)}
```

**Note** : ✅ Emojis affichés normalement sans traitement spécial dans les bulles. ✅ Emoji picker fonctionnel (insert dans input). Identique pour toutes les cellules.

---

## 5. APPELS

**Constat** : Les colonnes `message_type`, `is_call`, `call_duration` existent dans l'API Carlos (et sont gérées dans Grid Premium). Cependant, **dans TLG Pro, les appels ne sont pas traités différemment** : le rendu est générique.

**Détails** :
- Rendu TLG Pro : `_escapeHtml(msg.text || msg.content || msg.message || "[média]")` — pas de branchement sur `msg.is_call` ou `msg.message_type === "call"`
- Dans Grid Premium (autre composant) : détection + rendu spécial avec icône 📞 (lignes 31562-31568)
- Dans TLG Pro : un appel afficherait `undefined` → `[média]` ou un texte vide

**Extrait de code Grid Premium (pour comparaison — NON présent dans TLG Pro)** :
```javascript
// Grid Premium uniquement — ligne 31562-31568
if (msg.type === "call" || msg.is_call || msg.message_type === "call") {
  const dur = _gpFmtCallDur(msg.call_duration || msg.duration);
  return (
    <div style={{ color: "#a5b4fc", fontSize: 10, fontStyle: "italic" }}>
      <span>📞</span><span>{dur || "Appel"}</span>
    </div>
  );
}
```

**Note** : ❌ Aucun traitement spécifique pour les appels dans TLG Pro. Les appels seraient affichés comme `[média]` ou silencieusement ignorés.

---

## 6. MÉDIAS (PHOTO/VIDÉO)

**Constat** : **Deux aspects différents** — l'*envoi* de médias est fonctionnel, l'*affichage* dans les bulles est absent.

**Envoi de médias** :
- Bouton 🎬 par cellule → ouvre la media library ou upload direct via `_onMediaLib` callback
- Endpoints : `POST /send-photo`, `POST /send-video`, `POST /send-media` (lignes 33518-33562)
- Upload vers Supabase Storage (`media-library` ou `media` bucket) puis envoi URL Carlos
- GIF prédéfinis (6 GIFs Giphy hardcodés) envoyés via `tSendGif()` (ligne 32001)

**Affichage dans les bulles** :
- TLG Pro : `_escapeHtml(msg.text || msg.content || msg.message || "[média]")` → **aucun rendu image/vidéo**
- Si `msg.text` est vide et `msg.media_url` existe → affiche `[média]` comme texte
- Grid Premium (non-TLG Pro) : `<img>` avec lightbox, `<video controls>` (lignes 31570-31590)

**Extrait de code** :
```javascript
// Envoi média (TlgProStandalonePage) — ligne 33493-33495
const ep = isVideo ? "/send-video" : "/send-photo";
const bodyKey = isVideo ? "video_url" : "photo_url";
await _dmsgFetch(ep, { method: "POST",
  body: JSON.stringify({ chat_id: cid, [bodyKey]: mediaUrl, caption: "", model_id: convRef.model_id || "" }),
  timeout: isVideo ? 120000 : 30000 });

// Affichage dans bulle TLG Pro — ligne 32434
{_escapeHtml(msg.text || msg.content || msg.message || "[média]")}
```

**Note** : ❌ Aucun affichage de médias dans les bulles de messages TLG Pro (ni `<img>`, ni `<video>`, ni thumbnail). Pas de modal lightbox. L'envoi de médias est fonctionnel, mais leur réception n'est pas rendue visuellement.

---

## 7. SYSTÈME IA VENICE (SUGGESTIONS DE RÉPONSE)

> **Important** : Le nom "Venice" est utilisé comme branding produit. Les suggestions IA transitent par l'API Carlos (`/api/suggestions`). Venice AI est vraisemblablement appelée côté serveur (non-visible depuis le front). La mention "Venice réfléchit…" est dans le composant `IASuggestionsPanel` qui **n'est pas utilisé dans TLG Pro**.

### A) INTERFACE VISIBLE

**Constat** : Pas de sidebar ni panel dédié. Les suggestions s'affichent dans un **popup inline** au bas de chaque cellule, au-dessus de l'input, déclenché par le bouton ✨.

- **Position** : inline, dans le flux de chaque cellule, `maxHeight: 200px`, `overflowY: auto`
- **Nombre de suggestions** : variable — dépend de la réponse de l'API (généralement 3, sans maximum défini côté front)
- **Format** : texte brut uniquement (`s.text`) — pas de ton/catégorie affichés dans TLG Pro
- **Pas de sidebar** dédiée (contrairement au composant `IASuggestionsPanel` en classic/grid)

**Note** : ⚠️ Interface minimaliste. Le composant `IASuggestionsPanel` complet (avec tons tease/direct/push, ⭐ qualité, "Venice réfléchit…") est utilisé dans la messagerie classique et Grid Premium, mais **pas dans TLG Pro**.

### B) WORKFLOW

**Constat** : Les suggestions sont générées **manuellement** au clic sur le bouton ✨. Aucun déclenchement automatique sur nouveau message.

**Flux** :
1. Clic ✨ → `tTogglePopup(idx, "suggest")` → si pas encore chargé : `tLoadSuggestions(idx)`
2. `tLoadSuggestions` fait d'abord `GET /conversations/{cid}/messages?limit=5` (timeout 8s)
3. Extrait le **dernier message entrant** (`lastInbound`)
4. Appelle `POST https://dadash-autofill-v2-production.up.railway.app/api/suggestions` (timeout 20s)
5. Payload envoyé : `{ spender_id, model_id, last_message: lastText }`
6. L'historique complet de conversation **n'est pas envoyé** — seulement le dernier message entrant

**Extrait de code** :
```javascript
// ligne 31975-31999
const tLoadSuggestions = async (idx) => {
  setTSuggestData(p => ({ ...p, [idx]: { loading: true, items: [] } }));
  try {
    const conv = tSlots[idx];
    const cid = _dmsgChatId(conv);
    const msgsData = await _dmsgFetch("/conversations/" + cid + "/messages?limit=5", { timeout: 8000 });
    const msgs = Array.isArray(msgsData) ? msgsData : msgsData.messages || msgsData.data || [];
    const lastInbound = [...msgs].reverse().find(m => !m.is_outgoing && m.direction !== "out");
    const lastText = lastInbound?.text || lastInbound?.content || "";
    const sp = (spenders || []).find(s => String(s.tg_user_id || s.telegram_id || "") === String(cid));
    const res = await _dmsgFetch("/api/suggestions", {
      method: "POST",
      body: JSON.stringify({ spender_id: sp?.id || null, model_id: conv.model_id || "", last_message: lastText }),
      timeout: 20000,
    });
    if (res.success && res.suggestions) {
      setTSuggestData(p => ({ ...p, [idx]: { loading: false, items: res.suggestions } }));
    } else {
      throw new Error(res.error || "No suggestions");
    }
  } catch (err) {
    setTSuggestData(p => ({ ...p, [idx]: { loading: false, items: [{ text: "Erreur : " + err.message, _error: true }] } }));
  }
};
```

**Note** : ⚠️ Seul le dernier message entrant est envoyé (pas l'historique complet). La fonction globale `generateIASuggestions` (ligne 30984) supporte `mediaUrl` et profil spender — mais TLG Pro utilise sa propre version simplifiée `tLoadSuggestions`.

### C) INTERACTION CHATTER

**Constat** : Clic sur une suggestion → **insertion dans l'input individuel de la cellule** (pas d'envoi direct). Le popup se ferme automatiquement.

- Au clic suggestion → `setTInputs(p => ({ ...p, [idx]: s.text }))` + `setTPopup(p => ({ ...p, [idx]: null }))`
- Le chatter peut éditer le texte avant envoi
- **Bouton "🔄 Régénérer"** présent (ligne 32508)
- **Pas de catégorisation** affichée (tease/direct/push) dans TLG Pro — juste `s.text`

**Extrait de code** :
```javascript
// ligne 32499-32509
{sd.items.map((s, si) => (
  <div key={si} onClick={() => {
    if (!s._error) {
      setTInputs(p => ({ ...p, [idx]: s.text }));  // insertion dans input
      setTPopup(p => ({ ...p, [idx]: null }));       // ferme popup
    }
  }} ...>
    {s.text}
  </div>
))}
<button onClick={() => tLoadSuggestions(idx)} ...>🔄 Régénérer</button>
```

**Note** : ✅ Insertion dans input (éditable avant envoi). ✅ Bouton "Régénérer" présent. ⚠️ Pas de catégorisation tease/direct/push affichée (les données `tone`/`quality` de la réponse API ne sont pas rendues dans TLG Pro).

### D) CODE

- **Fonction** : `tLoadSuggestions(idx)` — locale à `TlgProSubpage` (ligne 31975)
- **État React** : `tSuggestData` = `{ [slotIdx]: { loading: boolean, items: Array<{text, _error?}> } }`
- **Pas de composant dédié** — tout est inline dans `TlgProSubpage`
- La fonction globale `generateIASuggestions` (ligne 30984) existe mais n'est **pas utilisée** dans TLG Pro
- `IASuggestionsPanel` (ligne 54194) n'est **pas utilisé** dans TLG Pro (seulement en messagerie classique et Grid Premium)

**Note** : ⚠️ Duplication : deux systèmes de suggestions coexistent (`tLoadSuggestions` pour TLG Pro vs `IASuggestionsPanel`+`generateIASuggestions` pour le reste). TLG Pro a la version simplifiée.

### E) CONFIGURATION

- **Modèle Venice** : non visible côté front (géré côté serveur Carlos API)
- **Clé API Venice** : non visible dans le code front — probablement en variable d'environnement côté serveur Railway
- **Clé API Carlos** : `window.CRM_API_KEY || window.DADASH_INTERNAL_API_KEY` (runtime, ligne 31035)
- Aucun paramètre de modèle, température, ou `uncensored-1.1` visible dans les appels front TLG Pro
- **Pas de debounce/throttle** sur les appels suggestions

**Note** : ✅ Clé API non exposée côté front (passée via header `X-API-Key`). ⚠️ Configuration Venice (modèle, température) opaque — gérée côté serveur.

---

## 8. LAYOUT GRID

**Constat** : Layouts disponibles et fonctionnels. Maximum confirmé : **3×4 = 12 cellules**.

**Layouts** :
| Clé | Cols | Slots | Max cellules |
|-----|------|-------|-------------|
| `2x2` | 2 | 4 | 4 |
| `2x3` | 3 | 6 | 6 |
| `3x3` | 3 | 9 | 9 |
| `3x4` | 4 | 12 | **12** |

- **Layout par défaut** : `3x3` (ligne 31836 : `useState("3x3")`)
- **Sélecteur visible** : boutons dans le header (ligne 32365-32370)
- ⚠️ **Pas de layout `1x1`**

**Header de chaque cellule** (ligne 32394-32420) :
- ✅ Emoji modèle (💜 Carla / 🩷 Sophie / 💛 Bella / ✨ Nadia)
- ✅ Prénom spender + badge modèle coloré
- ✅ Tier emoji (🦈 Shark / 🐋 Baleine / 🦍 Gorille / 🦧 Orang / 🐵 Ouistiti / 🐟 Poisson / 🆓 Free)
- ✅ Montant LTV en CHF (cliquable → TX History)

**Boutons d'action par cellule** : 🎬 Médias · 😊 Emojis · 🎁 GIF · ✨ Suggestions IA · 🔍 Vue détaillée

**Input** : ✅ **Individuel par cellule** (`tInputs[idx]`, textarea + bouton 💸 d'envoi)

**Indicateur cellule active** : ✅ Bordure bleue `#6366f1` + barre de couleur de 3px en haut (lignes 32390, 32392)

**Extrait de code** :
```javascript
// Définition — ligne 31315-31316
const GRID_LAYOUTS = {
  "2x2": { cols: 2, slots: 4 },
  "2x3": { cols: 3, slots: 6 },
  "3x3": { cols: 3, slots: 9 },
  "3x4": { cols: 4, slots: 12 }
};
const GRID_REFRESH_MS = 30000; // Realtime primary, polling fallback 30s
```

**Note** : ✅ Layout 3×4 = 12 cellules confirmé. ✅ Input individuel par cellule. ✅ Indicateur cellule active. ⚠️ Pas de layout `1x1`.

---

## 9. STRUCTURE DU COMPOSANT

**Constat** : Architecture en deux composants imbriqués, sans sous-composants dédiés pour les cellules ou suggestions.

**Hiérarchie** :
```
TlgProStandalonePage (ligne 33255)
  ├── TlgProSubpage (ligne 31833)        ← composant principal (grid + cellules)
  ├── TX Modal (ligne 33593)             ← modal création transaction
  ├── Info Spender Modal                 ← fiche spender
  ├── TX History Modal                   ← historique transactions
  └── Media Library Modal (openMediaLib) ← bibliothèque médias
```

**Sous-composants** : AUCUN — tout est inline dans `TlgProSubpage`. Pas de `VeniceCell`, pas de `AISuggestionPanel`, pas de `MessageBubble`.

**État React principal** (`TlgProSubpage`) :
```javascript
const [tLayout, setTLayout]           = useState("3x3");         // layout actif
const [tTabs, setTTabs]               = useState(_defaultTabs()); // onglets par modèle
const [tActiveTabId, setTActiveTabId] = useState("all-1");        // onglet actif
const [tSlotMsgs, setTSlotMsgs]       = useState({});             // {idx: messages[]}
const [tLoadingSlots, setTLoadingSlots]= useState({});            // {idx: bool}
const [tActiveSlot, setTActiveSlot]   = useState(null);           // cellule active
const [tInputs, setTInputs]           = useState({});             // {idx: string}
const [tSending, setTSending]         = useState({});             // {idx: bool}
const [tPopup, setTPopup]             = useState({});             // {idx: "emoji"|"gif"|"suggest"|null}
const [tSuggestData, setTSuggestData] = useState({});             // {idx: {loading, items[]}}
const [tSmartLoading, setTSmartLoading]= useState(false);
```

**Supabase Realtime** : ❌ **Absent dans TLG Pro**. Polling uniquement.

**Note** : ⚠️ Monolith sans sous-composants. ✅ Onglets multi-modèles (all/carla/sophie/bella/nadia), jusqu'à 3 onglets par modèle. ❌ Pas de Supabase Realtime dans TlgProSubpage.

---

## 10. PERFORMANCE

**Constat** : Aucune virtualisation ni memoization sur les cellules ou suggestions. Charge raisonnable pour le cas nominal.

**Détails** :
| Métrique | Valeur |
|---------|--------|
| Virtualisation | ❌ Aucune (react-window, react-virtuoso) |
| `React.memo` | ❌ Aucun sur les cellules |
| `useMemo` | ✅ `tUnreadSorted`, `tOpenChatIds`, `tPickerConvs` |
| Messages chargés/cellule | 30 (API) |
| Messages affichés/cellule | 12 (`slice(-12)`) |
| Debounce suggestions | ❌ Aucun |
| Cache conversations | ✅ `_DMSG_CONV_CACHE` (TTL 30s, partagé) |

**Charge maximale estimée (layout 3×4)** :
- **12 cellules × 30 messages chargés** = 360 objets en mémoire (12 × 12 = 144 rendus)
- **12 cellules × N suggestions** = ~36 items (si 3 suggestions/cellule)
- **Réinitialisation** : toutes les données sont vidées au changement d'onglet (ligne 31957-31968)
- **Pas de debounce** : chaque clic ✨ lance 2 appels API (messages + suggestions)

**Extrait de code** :
```javascript
// Reset état au changement d'onglet — ligne 31956-31968
const tPrevTabRef = React.useRef(tActiveTabId);
React.useEffect(() => {
  if (tPrevTabRef.current !== tActiveTabId) {
    setTSlotMsgs({});
    setTLoadingSlots({});
    setTActiveSlot(null);
    setTInputs({});
    setTSending({});
    setTPopup({});
    setTSuggestData({});
    tPrevTabRef.current = tActiveTabId;
  }
}, [tActiveTabId]);
```

**Note** : ✅ Charge totale modeste (360 msgs + 36 suggestions). ⚠️ Sans debounce, 12 clics ✨ simultanés = 24 appels API Carlos. ⚠️ Sans virtualisation, peut devenir lent si `slice(-12)` est augmenté.

---

## 11. TEMPS RÉEL ET SYNCHRONISATION

**Constat** : **Polling uniquement** à intervalle fixe de 30 secondes. Aucun Supabase Realtime ni WebSocket dans TLG Pro.

**Détails** :
- `setInterval` toutes les `GRID_REFRESH_MS = 30000 ms` (ligne 32210)
- Refresh "silencieux" (`silent = true`) : ne montre pas le spinner de chargement
- Scroll auto vers le bas uniquement au changement de `tSlotMsgs` (pas à chaque refresh si pas de nouveaux msgs)
- Les nouveaux messages **ne déclenchent pas automatiquement** une régénération des suggestions IA
- L'option "Auto-suggest sur nouveau message" (`autoSuggest` toggle) existe dans `IASuggestionsPanel` mais ce composant n'est pas utilisé dans TLG Pro

**Extrait de code** :
```javascript
// Polling — lignes 32208-32214
useEffect(() => {
  if (tRefreshRef.current) clearInterval(tRefreshRef.current);
  tRefreshRef.current = setInterval(() => {
    tSlots.forEach((c, i) => { if (c) tLoadMsgs(c, i, true); });  // silent=true
  }, GRID_REFRESH_MS);  // 30 000 ms
  return () => { if (tRefreshRef.current) clearInterval(tRefreshRef.current); };
}, [tSlots, tLoadMsgs]);
```

**Supabase Realtime dans d'autres composants** (non-TLG Pro) :
- Messagerie classique : `.channel('dmsg-messages-rt')` ligne 37073
- Grid Premium: `.channel('tg-page-messages-rt')` ligne 40018
- TLG Pro : ❌ aucun channel Supabase

**Note** : ❌ Délai max de 30s avant qu'un nouveau message apparaisse dans une cellule. ❌ Pas de push temps réel. ❌ Pas de déclenchement auto des suggestions IA sur nouveau message.

---

## RÉSUMÉ EXÉCUTIF

| # | Point d'audit | Statut |
|---|--------------|--------|
| 1 | Fetch historique (limit=30, individuel/cellule, Carlos API) | ⚠️ Limite 30 msgs, 12 affichés |
| 2 | Scroll vers le haut / scroll infini | ❌ Aucun scroll infini |
| 3 | Affichage date/heure dans les bulles | ❌ Absent |
| 4 | Emojis RX/TX + quick-reply | ✅ OK (insert dans input) |
| 5 | Appels (is_call, call_duration) | ❌ Non traités dans TLG Pro |
| 6 | Médias photo/vidéo dans bulles | ❌ Non rendus (affiche "[média]") |
| 7 | Système IA Venice/Carlos suggestions | ⚠️ Fonctionnel mais simplifié |
| 8 | Layout grid (2×2 à 3×4 = 12 cellules) | ✅ OK |
| 9 | Structure composant | ⚠️ Monolith, pas de sous-composants |
| 10 | Performance (charge, virtualisation) | ⚠️ Acceptable mais sans filet |
| 11 | Temps réel et synchronisation | ❌ Polling 30s uniquement |

- **Points OK** : 2/11
- **Points partiels/manquants** : 5/11
- **Problèmes critiques** : 4/11 (scroll infini, date/heure, appels, médias)
- **Charge maximale estimée** : 12 cellules × 30 messages (12 affichés) + 12 × ~3 suggestions = **504 éléments max en mémoire, 180 rendus**

---

## PROCHAINES ÉTAPES SUGGÉRÉES (sans toucher au système Venice)

> ⚠️ Ces recommandations sont HORS PÉRIMÈTRE de cet audit (aucune modification faite).

1. **Date/heure dans les bulles** : Ajouter `tTimeAgo(msg.created_at)` sous chaque bulle (fonction déjà disponible)
2. **Médias dans les bulles** : Ajouter détection `msg.media_url || msg.photo_url` avec `<img>` + lightbox (copier pattern Grid Premium)
3. **Appels dans les bulles** : Ajouter détection `msg.is_call || msg.message_type === "call"` avec icône 📞 (copier `renderGpMsgContent` de Grid Premium)
4. **Scroll infini** : Augmenter `limit=30` → `limit=50` + ajouter IntersectionObserver comme dans Grid Premium
5. **Temps réel** : Ajouter Supabase Realtime channel `tlg-pro-messages-rt` (pattern déjà présent dans Grid Premium)
6. **Suggestions auto** : Déclencher `tLoadSuggestions` sur nouveau message entrant détecté au refresh
7. **Layout `1x1`** : Ajouter `"1x1": { cols: 1, slots: 1 }` à `GRID_LAYOUTS`

**Contrainte** : Ne pas modifier `tLoadSuggestions` ni l'endpoint `/api/suggestions` — le système Venice côté serveur est fonctionnel.
