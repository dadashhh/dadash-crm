# AVIS CHATTER — LIVIO

> **Testeur** : Livio, 23 ans, chatter DADASH depuis 2 mois
> **Role teste** : Chatter
> **Date** : 22 fevrier 2026
> **URL** : dadash.co
> **Methode** : Analyse complete du code source + simulation du workflow chatter quotidien (14h-2h)

---

## SCORES UX

| Plateforme | Score |
|-----------|-------|
| **UX Mobile** | **5/10** |
| **UX Desktop** | **7/10** |

---

## TOP 5 FRUSTRATIONS

### 1. La messagerie est inutilisable sur mobile
La page Messagerie (`ChatterMessagerieTab`) utilise un layout fixe `gridTemplateColumns:"300px 1fr"` — sur un ecran de 375px, la liste des conversations prend TOUT l'ecran et le chat n'est pas visible. Quand je bosse depuis mon tel (ce qui est 80% du temps), je peux pas chatter correctement avec les spenders.

**Fichier** : `index.html:13771`

### 2. Pas de visibilite sur mes commissions en temps reel
Mon dashboard montre le CA Brut, le nombre de TX, les spenders actifs et les TX pending — mais **nulle part je vois mes commissions**. Je dois aller dans l'onglet Compta pour voir mes fiches de paie, mais elles ne montrent que les totaux deja generes. Je ne sais pas combien je vais toucher sur mes ventes du jour. Mon % de commission n'est affiche nulle part dans mon espace.

**Fichier** : `index.html:12685-12781` (ChatterDashboardTab — aucun KPI commission)

### 3. Le Scan Checker demande une cle API que j'ai pas
Pour utiliser le scan checker avec Claude Vision, je dois entrer une cle API Anthropic (`sk-ant-...`). Le message dit "Demande la cle API a ton gerant" — mais c'est bizarre qu'un outil critique pour mon taf quotidien depende d'une cle que je dois demander par message. Ca devrait etre configure cote serveur ou fourni automatiquement par le gerant dans l'admin.

**Fichier** : `index.html:15662` (localStorage API key)

### 4. Le dashboard KPI est crampe sur mobile
Les 4 KPIs du dashboard utilisent `gridTemplateColumns:"repeat(4,1fr)"` sans adaptation mobile. Sur un iPhone SE (375px), ca donne 4 colonnes de ~85px chacune. Les chiffres sont coupes, illisibles. Pareil pour la page Transactions et la page Spenders — les grilles 4 colonnes ne passent pas sur petit ecran.

**Fichier** : `index.html:12731` (repeat(4,1fr) sans media query)

### 5. Pas de date picker pour les TX passees
Quand je cree une TX, la date est auto-generee (`new Date()` avec timezone Paris). Mais parfois un spender paye a 1h du matin et je log la TX le lendemain — je peux pas corriger la date. Le formulaire de creation n'a pas de champ date du tout.

**Fichier** : `index.html:12847-12848` (date auto-set, pas de champ date dans le form)

---

## TOP 5 POINTS POSITIFS

### 1. Le design est propre et pro
Le dark theme est vraiment bien fait — les CSS custom properties sont coherentes, les couleurs de statut (success/warning/danger) sont lisibles, les cards ont du style. Ca fait serieux quand un spender voit mon ecran par-dessus mon epaule. Les badges VIP et les sparklines sur les profils spenders, c'est la classe.

### 2. Les alertes IA sur les spenders sont tres utiles
Dans l'onglet Spenders, les alertes automatiques ("@handle inactif depuis 15j — relancer", "3 achats cette semaine — proposer pack premium") sont exactement ce dont j'ai besoin pour prioriser mes relances. C'est le genre d'outil qui me fait gagner des ventes.

**Fichier** : `index.html:13188-13227` (Chatter Spender Alerts IA)

### 3. Le systeme de gamification / competition motive
Le classement entre chatters avec les niveaux (Debutant > Apprenti > Confirme > Expert > Legende), les scores XP, les streaks — ca donne envie de se depasser. Quand je vois un autre chatter devant moi, je push plus fort. C'est malin.

**Fichier** : `index.html:13888-13955` (CHATTER_LEVELS + ChatterCompetitionTab)

### 4. Les fiches spenders sont completes
Je peux noter le prenom, la langue, les preferences, le contenu favori, le meilleur moment pour contacter, les notes perso, le budget range... C'est exactement ce qu'il me faut pour personnaliser mes conversations. Avant (Excel), j'avais jamais autant d'infos structurees.

**Fichier** : `index.html:13100-13115` (edit mode spender profile)

### 5. Le FAB (bouton flottant) est pratique
Les 2 actions rapides (Creer TX + Verifier Screen) en un clic depuis n'importe quel ecran, c'est bien pense pour le workflow mobile. Ca evite de naviguer dans les onglets pour les actions les plus frequentes.

**Fichier** : `index.html:1809-1812` (FAB_ACTIONS_CHATTER)

---

## 10 SUGGESTIONS D'AMELIORATION PRIORISEES

### P0 — CRITIQUE (a faire maintenant)

#### 1. Rendre la messagerie responsive sur mobile
La grille `300px 1fr` doit devenir un layout empile sur mobile : liste des conversations en plein ecran, puis quand on clique, le chat prend tout l'ecran avec un bouton retour. C'est le pattern standard de toute app de messagerie.

```
// Suggestion: dans ChatterMessagerieTab
// Mobile: afficher soit la liste, soit le chat (pas les deux)
// Desktop: garder le layout split 300px 1fr
```

#### 2. Ajouter un KPI "Mes Commissions" sur le dashboard chatter
Le chatter devrait voir en haut de son dashboard :
- Commission totale gagnee (periode)
- Commission en attente (TX pending)
- Mon % de commission
- Derniere commission recue

Le dashboard filtre deja les TX par `myModelIds`, il suffit d'ajouter `chatter_commission` dans les calculs.

#### 3. Rendre les grilles KPI responsive (2 colonnes sur mobile)
Remplacer `gridTemplateColumns:"repeat(4,1fr)"` par `gridTemplateColumns: _isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)"` dans tous les composants chatter (Dashboard, Transactions, Spenders, Compta).

### P1 — IMPORTANT (semaine prochaine)

#### 4. Ajouter un champ date optionnel dans le formulaire TX
Permettre au chatter de selectionner une date pour les TX passees. Par defaut = aujourd'hui, mais modifiable. Ajouter un `<input type="date">` dans le formulaire de creation.

#### 5. Integrer la cle API Scan Checker cote serveur
Au lieu de demander a chaque chatter de coller sa cle API Anthropic dans localStorage, le gerant devrait pouvoir configurer une cle globale dans l'admin. Utiliser un edge function Supabase comme proxy pour ne pas exposer la cle cote client.

#### 6. Ajouter des notifications push pour les TX validees
Quand le gerant valide une de mes TX, je vois rien tant que je refresh pas. Il faudrait un systeme de notification en temps reel (Supabase Realtime ou polling) pour que je voie immediatement "TX validee — commission 45 CHF".

### P2 — NICE TO HAVE (mois prochain)

#### 7. Ajouter des raccourcis clavier / swipe actions
Sur mobile, un swipe gauche sur une TX pour l'editer, swipe droite pour la dupliquer. Sur desktop, des raccourcis : `N` pour nouvelle TX, `S` pour scan, `R` pour refresh.

#### 8. Historique des commissions avec graphique
Un graphique d'evolution de mes commissions jour par jour / semaine par semaine dans l'onglet Compta. Le composant BarChart est deja utilise dans le dashboard, il suffit de l'alimenter avec les donnees de commission.

#### 9. Mode hors-ligne basique pour la creation de TX
L'app est une PWA mais ne fonctionne pas offline. Au minimum, permettre de creer des TX en local qui se synchronisent quand la connexion revient (IndexedDB + sync queue).

#### 10. Template de messages pour la messagerie
Des reponses pre-ecrites pour les situations courantes ("Merci pour ton paiement", "Voici le lien du pack", "Nouveau contenu dispo") qu'on peut envoyer en un clic. Ca accelererait enormement le chat.

---

## BUGS TROUVES

### BUG 1 — Double attribut `style` sur le select Tag (EditTxModal)
**Severite** : Faible (cosmetique)
**Fichier** : `index.html:2913-2916`
**Description** : Le `<select>` pour les tags dans `EditTxModal` a deux attributs `style` sur le meme element. En React, le dernier ecrase le premier. Le premier `style={inputStyle}` est ignore au profit du second `style={!product?{...inputStyle,opacity:0.5}:inputStyle}`. Pas de bug visible car le second inclut `inputStyle`, mais c'est du code mort.

```jsx
// Ligne 2913 : style={inputStyle}  <-- ignore par React
// Ligne 2916 : style={!product?{...inputStyle,opacity:0.5,cursor:"not-allowed"}:inputStyle}
```

### BUG 2 — WhatsApp Analyzer visible dans la nav mais pas accessible
**Severite** : Moyenne
**Fichier** : `index.html:20597` et `index.html:1739`
**Description** : L'onglet "WhatsApp Analyzer" est defini dans `otherTabs` avec `show: user.role==="chatter"`, mais l'ID `"whatsapp"` n'est PAS dans `ROLE_ACCESS.chatter`. Donc `canSee(user.role, "whatsapp")` retourne `false` et le tab est filtre dans la bottom bar. C'est un onglet fantome — soit il faut l'ajouter au ROLE_ACCESS, soit le retirer de otherTabs.

### BUG 3 — Messagerie : layout casse sur ecrans < 768px
**Severite** : Haute
**Fichier** : `index.html:13771`
**Description** : `gridTemplateColumns:"300px 1fr"` sur un ecran de 375px = overflow horizontal. La liste de conversations depasse l'ecran et le chat n'est pas accessible sans scroll horizontal.

### BUG 4 — Dashboard KPI overflow sur petits ecrans
**Severite** : Moyenne
**Fichier** : `index.html:12731`
**Description** : `gridTemplateColumns:"repeat(4,1fr)"` sans breakpoint mobile. Sur iPhone SE (375px), chaque colonne fait ~85px. Les valeurs numeriques sont coupees et les labels illisibles.

### BUG 5 — Compta KPI : 3 colonnes sur mobile
**Severite** : Moyenne
**Fichier** : `index.html:13839`
**Description** : Meme probleme que le dashboard — `gridTemplateColumns:"repeat(3,1fr)"` dans ChatterComptaTab. Les 3 KPIs sont trop serres sur petit ecran.

### BUG 6 — Spender detail KPI : 4 colonnes sur mobile
**Severite** : Moyenne
**Fichier** : `index.html:13085`
**Description** : Le detail d'un spender affiche 4 KPIs en `gridTemplateColumns:"repeat(4,1fr)"`. Sur mobile, les chiffres LTV/TX/Validated/Pending sont coupes.

### BUG 7 — TX creation : pas de validation Provider/Payment Method
**Severite** : Faible
**Fichier** : `index.html:12829-12853`
**Description** : Le formulaire de creation de TX pour le chatter n'inclut PAS de champ Provider ni de Payment Method, contrairement au formulaire du gerant (EditTxModal). Le chatter cree des TX sans provider — le gerant doit les completer manuellement.

### BUG 8 — Scan Checker : paste handler ne se met pas a jour avec la cle API
**Severite** : Faible
**Fichier** : `index.html:15776-15790`
**Description** : Le `useEffect` pour le paste handler a `[apiKey]` comme dependance, mais `handleFile` capture l'ancien `apiKey` via closure au moment du montage. Si on colle une image AVANT de configurer la cle API, puis qu'on configure la cle, le paste handler utilise toujours l'ancienne valeur. Il faut un `useCallback` ou un ref pour `handleFile`.

---

## COMPARAISON AVEC AVANT

| Critere | Avant (Excel/Notes) | DADASH CRM |
|---------|---------------------|------------|
| Temps pour logger une TX | ~2 min (ouvrir Excel, trouver la ligne, remplir) | ~15 sec (FAB > formulaire > creer) |
| Suivi des commissions | Calcul manuel en fin de mois | Auto (mais pas visible en dashboard) |
| Fiches spenders | Notes desorganisees dans le tel | Fiches structurees avec badges VIP |
| Verif screenshot paiement | A l'oeil, demander au gerant | Scan Checker IA (quand ca marche) |
| Competition entre chatters | Aucune visibilite | Classement live + gamification |
| Acces mobile | Impossible (Excel sur tel = galere) | PWA installable (mais UX a ameliorer) |

---

## NOTE GLOBALE

**6.5/10** pour mon usage quotidien de chatter.

Le CRM est une grosse amelioration par rapport a Excel. Les fonctionnalites sont la : TX, spenders, scan, competition, compta. Le design est propre et moderne. Mais l'experience mobile — qui est mon outil principal — a des problemes de layout qui me font perdre du temps. La messagerie cassee sur mobile, c'est le plus gros point noir. Et ne pas voir mes commissions sur le dashboard, c'est frustrant quand je bosse a la performance.

Si les 3 fixes P0 sont faits (messagerie mobile, KPI commissions, grilles responsive), la note monte a **8/10**.

---

*Rapport genere par Livio — Agent Chatter DADASH*
*22 fevrier 2026*
