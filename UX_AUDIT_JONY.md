# DADASH UX AUDIT — Par Jony, Directeur UX/UI

**Date :** 22 fevrier 2026
**Version auditee :** V2 (index.html monolithe, 21 074 lignes)
**Methode :** Analyse heuristique complete + revue de code

---

> *"People know what they want only after they see it."*
> Le probleme de DADASH V2, c'est qu'il montre TOUT, tout le temps, a tout le monde. L'utilisateur ne sait plus ou regarder.

---

## RESUME EXECUTIF

DADASH V2 est un produit impressionnant en termes de fonctionnalites. C'est aussi un produit qui souffre de **surcharge cognitive chronique**. Chaque ecran essaie d'en faire trop. Le systeme de design existe mais n'est pas respecte (couleurs hard-codees dans le JSX). Le mobile est traite serieusement mais reste une version comprimee du desktop plutot qu'une experience native.

**Score UX global actuel : 52/100**

---

## PHASE 1 — AUDIT DESTRUCTIF, ECRAN PAR ECRAN

### 1. Login / Onboarding

**Ce qui fonctionne :**
- Card centree sur fond sombre — clean, focalisee
- Orbs decoratifs subtils (blur 40px, opacity 0.1) — ambiance premium sans distraction
- Logo gradient reconnaissable
- Support multilingue (6 langues)

**Ce qui ne fonctionne pas :**

| Probleme | Severite | Detail |
|----------|----------|--------|
| Zero onboarding | Critique | Apres le login, l'utilisateur est largue dans un dashboard complexe sans aucune guidance. Pas de tour, pas de tooltips, pas de "bienvenue voici vos 3 premieres actions" |
| Pas de "mot de passe oublie" visible | Majeur | Friction maximale pour un utilisateur bloque |
| `user-scalable=no` dans le viewport | Majeur | Bloque le zoom accessibilite. WCAG fail. Un utilisateur malvoyant ne peut pas agrandir le texte |
| Formulaire a 2 champs mais zero validation inline | Mineur | L'erreur apparait en texte rouge apres soumission, pas pendant la saisie |
| Pas d'indication de force du mot de passe | Mineur | — |

**Score Login : 55/100**

---

### 2. Dashboard Principal (Gerant)

Le dashboard gerant est le coeur du produit. C'est aussi l'ecran le plus surcharge.

**Hierarchie visuelle — ECHOUEE**

L'oeil ne sait pas ou aller. On a :
- 6+ KPI cards en haut (auto-fit grid)
- Puis des charts
- Puis des tables
- Puis encore des cards

**Tout a la meme importance visuelle.** Aucun KPI n'est visuellement priorise. Le CA du jour et le nombre de TX en attente ont la meme taille, la meme couleur, le meme poids. Or, "TX en attente" necessite une ACTION, pas juste une lecture.

**Problemes specifiques :**

| Probleme | Severite | Detail |
|----------|----------|--------|
| Densite d'info excessive | Critique | 6+ KPIs + charts + tables sur un seul viewport. Charge cognitive >7 items (limite de Miller) |
| Pas de hierarchie d'action | Critique | Les KPI "informatifs" (CA total) et "actionnables" (TX pending) ont le meme traitement visuel |
| Sub-tabs "Analytics" / "Operations" | Majeur | La separation est confuse. Un gerant veut un cockpit unifie, pas deux onglets a switcher |
| Hard-coded colors dans le JSX | Majeur | `#1A1A2E`, `#2A2A3E`, `#8B5CF6` directement dans les styles inline au lieu d'utiliser les CSS variables definies. Casse la coherence quand on change de theme |
| Pas de "time range" global | Majeur | Les KPIs montrent des periodes differentes sans que ce soit clair. "Aujourd'hui" ? "Ce mois" ? "Depuis toujours" ? |
| Charts sans contexte | Moyen | Les graphiques Recharts sont presents mais manquent de labels clairs, de comparaison temporelle (vs semaine derniere), de trend indicators |
| Pas de "derniere activite" visible | Moyen | Quand a ete faite la derniere TX ? Par qui ? Le dashboard devrait respirer le temps reel |

**Ce que font les meilleurs :**
- **Stripe Dashboard** : 3 KPIs max en haut, gros, clairs. Un graphique temporel central. Une liste d'activite recente.
- **Mercury** : Un seul chiffre dominant (solde), puis des insights progressifs.

**Score Dashboard Gerant : 40/100**

---

### 3. Dashboard Chatter

Le chatter est sur mobile 70% du temps. C'est l'utilisateur le plus frequent.

**Problemes specifiques :**

| Probleme | Severite | Detail |
|----------|----------|--------|
| Pas de "quick action" TX en haut | Critique | Le chatter cree 20+ TX par jour. Le bouton de creation devrait etre a 1 tap, pas dans un FAB |
| Competition/gamification presente mais pas motivante | Moyen | Le podium/classement existe mais manque de dynamisme. Pas de progression visible, pas de "tu es a 50€ du top 3" |
| Objectifs chatters non integres au dashboard | Moyen | Les objectifs existent (renderChatterObjectifs) mais sont dans un sous-composant, pas front-and-center |
| Session timeout 30min sans warning | Mineur | Le chatter perd sa session sans avertissement prealable. Un toast 5min avant serait necessaire |

**Score Dashboard Chatter : 48/100**

---

### 4. Dashboard Provider

**Problemes specifiques :**

| Probleme | Severite | Detail |
|----------|----------|--------|
| Manque de clarte financiere | Majeur | Le provider veut savoir : "Combien je gagne ce mois ?", "Quand est mon prochain paiement ?", "Quel modele rapporte le plus ?". Ces 3 questions doivent avoir une reponse en 3 secondes |
| Pas de graphique de tendance | Moyen | Le provider ne voit pas l'evolution de ses revenus dans le temps |
| Navigation confuse | Moyen | Les tabs provider_dashboard / transactions / provider_compta ne sont pas clairement differencies |

**Reference : Revolut** — 1 chiffre central (solde), 1 graphique de tendance, liste de mouvements recents.

**Score Dashboard Provider : 45/100**

---

### 5. Transactions — Liste + Creation + Edition

C'est la fonctionnalite la plus utilisee du produit. Elle merite une attention extreme.

#### Liste des TX

| Probleme | Severite | Detail |
|----------|----------|--------|
| Table horizontale non adaptee au mobile | Critique | Sur mobile, la table scrolle horizontalement. Sur un CRM ou 70% des utilisateurs sont sur mobile, c'est inacceptable. Les TX doivent etre des CARDS sur mobile |
| Pas de bulk actions visibles | Majeur | Valider 10 TX une par une quand on en a 50 en attente = perte de temps massive. Il faut du batch validate/refuse |
| Filtres trop lineaires | Moyen | La barre de filtres (chips + date + select) est fonctionnelle mais pas intelligente. Pas de filtres sauvegardes, pas de "smart filters" (ex: "TX pending depuis >24h") |
| Pagination server-side mais UX de pagination basique | Moyen | Pas d'infinite scroll, pas de "load more". Navigation par page classique — OK desktop, frustrant mobile |
| Tri des colonnes sans indication de direction | Mineur | Le `.sort-arrow` existe mais l'opacity 0.4 le rend invisible |

#### Creation TX (Formulaire)

| Probleme | Severite | Detail |
|----------|----------|--------|
| Formulaire en modal | Critique | Le formulaire le plus utilise du produit est dans une modale. Sur mobile, ca veut dire un overlay etroit avec scroll interne. Ca devrait etre une PAGE DEDIEE avec navigation retour |
| Trop de champs visibles d'emblee | Majeur | Progressive disclosure absent. Montrer spender + montant + modele + preuves. Le reste en "details avances" |
| Pas d'autocompletion spender | Majeur | Si le chatter tape "@" il devrait avoir une suggestion instantanee |
| Pas de scan-to-fill | Moyen | On pourrait pre-remplir le montant a partir du scan de screenshot |
| Hard-coded modal colors | Moyen | `#12121F`, `#0D0D1A`, `#2A2A3E` dans le JSX des modales FAB au lieu des CSS variables. Casse en light mode |

**Reference : Stripe** — Creation de paiement en 3 etapes claires avec validation a chaque step. **Linear** — Cmd+K pour creer n'importe quoi en 2 secondes.

**Score Transactions : 42/100**

---

### 6. Spenders (Liste + Detail)

| Probleme | Severite | Detail |
|----------|----------|--------|
| Cards grid adequate mais recherche lente | Majeur | Pas de search-as-you-type visible. Le filtre existe mais n'est pas mis en avant |
| Vue 360 du spender trop chargee | Majeur | Le profile-panel essaie de tout montrer : infos perso, historique TX, stats, tags. Ca devrait etre en tabs ou en sections collapsibles |
| Pas de "derniere interaction" prominent | Moyen | Le spender card montre le LTV et les meta-datas. La derniere interaction (quand, par qui, montant) devrait etre LA premiere info visible |
| Classification spender (whale/vip/regular/dormant) bonne mais pas actionnee | Moyen | Le badge existe mais il n'y a pas de filtres rapides "Voir tous les whales" ou "Spenders dormants a relancer" |

**Score Spenders : 50/100**

---

### 7. Modeles (Gestion)

| Probleme | Severite | Detail |
|----------|----------|--------|
| Vue liste + detail en meme page | Moyen | L'info est dense. Les modeles sont dans un tab "equipe" qui contient aussi chatters et providers. Contexte switching |
| Pas de "health check" modele | Moyen | Pas de signal visuel rapide pour "ce modele performe bien / mal / a besoin d'attention" |
| Tasks, content, checklist eparpilles | Moyen | Les fonctionnalites de gestion de modele (taches, contenu, checklists) existent mais sont dans des sous-tabs dissemines |

**Score Modeles : 52/100**

---

### 8. Providers (Gestion + Paiements)

| Probleme | Severite | Detail |
|----------|----------|--------|
| Reversements complexes sans workflow clair | Majeur | Le flux "calculer montant du → creer paiement → valider" n'est pas guide. Pas de wizard/stepper |
| Payment methods gestion confuse | Moyen | L'ajout de methodes de paiement provider est dans la meme page que les reversements. Separation necessaire |

**Score Providers : 48/100**

---

### 9. Compta (P&L, Factures, Depenses)

| Probleme | Severite | Detail |
|----------|----------|--------|
| P&L dense mais fonctionnel | Moyen | Le P&L fonctionne mais la presentation pourrait beneficier de sparklines et de comparaisons temporelles |
| Export PDF via html2pdf | Mineur | Fonctionnel mais qualite de rendu mediocre. Un export server-side serait meilleur |
| 4 sous-tabs (P&L, Paies, Reversements, Factures) | Moyen | Beaucoup d'information segmentee. Un utilisateur doit switcher 4 fois pour avoir la vue complete |

**Score Compta : 55/100**

---

### 10. Navigation (Sidebar, Bottom Nav, Cmd+K)

**Desktop Sidebar :**
- Le toggle collapse/expand est bon (72px → 220px)
- Les icones sont des emojis. Probleme : les emojis ont un rendu different selon l'OS, le navigateur, la version. Inconsistance visuelle garantie. Il faut des SVG icons
- Badge de notifications (pending TX) bien place

**Mobile Bottom Nav :**
- 5 icones + hamburger — standard iOS/Android pattern. Bien
- Le "Plus" (hamburger) ouvre un bottom sheet — bon pattern
- Mais : les 5 icones sont fixes (Dash, Business, Equipe, Auto, Compta). Le chatter et le provider ont des besoins differents. La bottom nav devrait etre adaptee au role

**Cmd+K Search (Gerant uniquement) :**
- Existe mais reserve au desktop (`!_isMobile`)
- Devrait etre accessible partout, y compris sur mobile via un bouton "recherche" dans la topbar

| Probleme | Severite | Detail |
|----------|----------|--------|
| Icones emoji au lieu de SVG | Majeur | Rendu inconsistant cross-platform, non-scalable, non-stylable |
| Bottom nav identique pour tous les roles | Moyen | Le chatter n'a pas besoin de "Compta" en bottom nav. Il a besoin de "TX" et "Scan" |
| Search masque sur mobile | Moyen | Un CRM sans recherche rapide sur mobile = friction |
| Sidebar hard-coded purple `#8B5CF6` | Mineur | Au lieu d'utiliser `var(--accent)`. Casse si on change la couleur d'accent |

**Score Navigation : 58/100**

---

### 11. Formulaires (Creation TX, Edition)

| Probleme | Severite | Detail |
|----------|----------|--------|
| Tout en modales | Critique | Les formulaires de creation (TX, spender, modele, assignation) sont tous en modale. Sur mobile, les modales sont une UX degradee. Les actions frequentes meritent des pages dediees |
| Padding input 10px trop petit en mobile | Majeur | Les touch targets des inputs sont a 10px padding. Avec font-size 13px, ca donne une hauteur ~38px. La regle est 44px minimum (Apple HIG). Le CSS mobile corrige partiellement mais c'est inconsistant |
| Pas de validation en temps reel | Majeur | Les erreurs apparaissent apres soumission. La validation devrait etre inline et instantanee |
| Labels en uppercase 10px | Moyen | Lisibilite discutable. Le uppercase force l'oeil a decoder chaque lettre individuellement. 12px sentence-case serait plus lisible |
| Hard-coded modal styles | Moyen | Les modales FAB utilisent `#12121F`, `#0D0D1A` au lieu des variables CSS. En light mode, ces modales restent sombres |

**Score Formulaires : 38/100**

---

### 12. Scan Checker

| Probleme | Severite | Detail |
|----------|----------|--------|
| Workflow bon en theorie | — | Upload screenshot → AI analysis → validation. Le concept est solide |
| Pas de camera directe | Majeur | Le chatter devrait pouvoir ouvrir la camera et prendre la photo directement, pas passer par la galerie |
| Resultat AI pas assez actionnable | Moyen | Le resultat du scan devrait proposer "Creer TX avec ces infos" en 1 clic |
| Reset form complexe | Mineur | resetForm() reinitialise 6 states. Un pattern reducer serait plus propre |

**Score Scan Checker : 50/100**

---

### 13. Notifications

| Probleme | Severite | Detail |
|----------|----------|--------|
| Dropdown bien structure | — | Header, feed scrollable, mark all read — bon pattern |
| Mais dans un dropdown, pas une page | Moyen | 30 notifications max dans un dropdown. Pour l'historique, il faut une page dediee |
| Pas de categories/filtres | Moyen | Toutes les notifications sont dans un seul flux. Pas de "TX seulement" ou "Scans seulement" |
| Icons via emojis | Mineur | Meme probleme que la sidebar — inconsistance cross-platform |
| Position fixed sur mobile vs absolute desktop | Mineur | Le code conditionnel `_isMobile?"fixed":"absolute"` est fragile |

**Score Notifications : 55/100**

---

### 14. Export

| Probleme | Severite | Detail |
|----------|----------|--------|
| Export CSV fonctionnel | — | exportTxCSV, exportSpendersCSV, exportPnlCSV, exportLogsCSV — bon coverage |
| Export PDF via html2pdf client-side | Moyen | Qualite de rendu variable. Pas de preview avant export |
| Pas de planification d'export | Mineur | Pas de "envoyer le rapport P&L chaque lundi par email" |

**Score Export : 60/100**

---

### 15. Settings

**Le tab Settings est un PlaceholderTab.** Litteralement :
```
{subTab==="settings"&&<PlaceholderTab title={t(lang,"settings")} />}
```

Il n'y a PAS de page settings. Le theme toggle est dans la topbar. La langue aussi. Le timezone aussi. Tout est eparpille dans des controles topbar au lieu d'etre centralise.

**Score Settings : 15/100**

---

## PROBLEMES ARCHITECTURAUX TRANSVERSAUX

### 1. Monolithe de 21 074 lignes
Un seul `index.html` avec tout le CSS, tout le JS, tous les composants React. Pas de code splitting, pas de lazy loading reel. Le navigateur doit parser et compiler (via Babel standalone !) 21K lignes a chaque chargement.

### 2. Babel Standalone en production
```html
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
```
Le JSX est compile DANS LE NAVIGATEUR. C'est un anti-pattern majeur en production. Impact direct sur les performances de chargement (temps de parsing + compilation).

### 3. React et Recharts via CDN non-bundled
```html
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
```
Pas de bundler (Vite, webpack). Pas de tree-shaking. Pas de minification du code applicatif. Le code metier est en clair dans le HTML.

### 4. Inline styles massifs vs CSS variables
Le design system CSS est bien defini (lignes 45-138), mais le JSX utilise massivement des couleurs hard-codees :
- `#1A1A2E` (au lieu de `var(--bg-overlay)` ou similaire)
- `#2A2A3E` (au lieu de `var(--border-default)`)
- `#8B5CF6` (au lieu de `var(--accent)`)
- `#12121F`, `#0D0D1A` (couleurs non definies dans le design system)

Resultat : le light mode est casse dans certaines modales et composants.

### 5. Emojis comme icones
Les icones de navigation, d'actions, de statut utilisent des emojis Unicode. Problemes :
- Rendu different entre macOS, Windows, Android, iOS
- Non-stylables (pas de changement de couleur, de taille fine)
- Non-accessibles (pas de `aria-label` systematique)
- Poids visuel inconsistant

---

## SCORES UX DETAILLES

### Score actuel : 52/100

| Critere | Score | Commentaire |
|---------|-------|-------------|
| **Clarte visuelle** | 10/20 | Hierarchie absente. Tout a la meme importance. Les KPIs, les tables, les actions — tout est au meme niveau |
| **Coherence** | 11/20 | Le design system CSS est bon mais non respecte dans le JSX. Hard-coded colors partout. Emojis vs icones. Modales vs pages |
| **Efficacite** | 9/20 | Trop de clics pour les actions frequentes. TX creation en modale. Pas de bulk actions. Filtres basiques |
| **Mobile experience** | 12/20 | Le responsive existe et est serieux (breakpoints, bottom nav, safe areas). Mais c'est du "desktop compresse", pas du mobile-first |
| **Plaisir d'utilisation** | 10/20 | Les animations existent (fadeIn, slideUp, pulse). Les toasts sont sympas. Mais l'ensemble est trop dense pour etre agreable. Pas de moments "delightful" |

### Score cible apres refonte : 85/100

| Critere | Cible | Comment |
|---------|-------|---------|
| **Clarte visuelle** | 17/20 | Hierarchie stricte. 1 action primaire par ecran. KPIs priorises. Espace blanc genereux |
| **Coherence** | 18/20 | Zero hard-coded colors. Design tokens respectes partout. Librairie d'icones SVG. Patterns uniformes |
| **Efficacite** | 16/20 | TX creation en 3 taps. Bulk actions. Smart filters. Cmd+K partout |
| **Mobile experience** | 17/20 | Mobile-first reel. Cards au lieu de tables. Camera native pour scan. Bottom nav par role |
| **Plaisir d'utilisation** | 17/20 | Micro-interactions significatives. Empty states engageants. Confetti sur objectifs atteints. Transitions fluides |

---

## RECOMMANDATIONS PRIORITAIRES

### Faisables en 1 sprint (1 semaine)

1. **Remplacer toutes les couleurs hard-codees** par des CSS variables. Grep `#1A1A2E`, `#2A2A3E`, `#8B5CF6`, `#12121F`, `#0D0D1A`, `#6B7280`, `#9CA3AF` et remplacer par les variables equivalentes
2. **Retirer `user-scalable=no`** du viewport meta — fix accessibilite immediat
3. **Ajouter `aria-label`** sur tous les boutons icones/emoji
4. **Augmenter la taille des touch targets** a 44px minimum partout
5. **Ajouter un time-range selector global** sur le dashboard (Aujourd'hui / 7j / 30j / Custom)
6. **Adapter la bottom nav mobile par role** — le chatter obtient: Dashboard, TX, Spenders, Scan, Plus

### Faisables en 1 mois

1. **Extraire les formulaires de modales vers des pages dediees** (TX creation, spender creation)
2. **Remplacer les emojis par une librairie d'icones SVG** (Lucide, Phosphor, ou Heroicons)
3. **Implementer des cards TX sur mobile** au lieu de la table horizontale
4. **Ajouter des bulk actions** sur la liste TX (select all pending → validate)
5. **Creer une vraie page Settings** avec toutes les preferences centralisees
6. **Validation inline** sur tous les formulaires
7. **Integrer la camera native** dans le Scan Checker
8. **Ajouter Cmd+K / recherche universelle** sur mobile

### Pour la V3 (post-SaaS)

1. **Migration vers un bundler** (Vite) — supprimer Babel standalone
2. **Code splitting** — charger chaque section a la demande
3. **Decomposition du monolithe** en composants fichiers separes
4. **Service de notifications push** (Web Push API)
5. **Mode offline** reel avec sync (le service worker existe mais est basique)
6. **Onboarding interactif** par role (product tour)
7. **Dashboard personnalisable** (drag-and-drop de widgets)
8. **Theming avance** (couleur d'accent par agence pour le mode SaaS multi-tenant)

---

## REFERENCES PAR ECRAN

| Ecran | Reference 1 | Reference 2 | Pourquoi |
|-------|------------|------------|----------|
| Dashboard Gerant | **Stripe Dashboard** | **Mercury** | Clarte des KPIs, graphiques temporels, activite recente |
| Dashboard Chatter | **Revolut** | **Linear** | Quick actions, progression visible, gamification subtile |
| Dashboard Provider | **Wise Business** | **Mercury** | Focus sur le solde, tendances, prochains paiements |
| TX Creation | **Stripe Checkout** | **Linear (Cmd+K)** | Formulaire step-by-step, autocompletion, vitesse |
| Liste TX | **Stripe Payments** | **Linear Issues** | Filtres intelligents, bulk actions, vue adaptative |
| Spender Detail | **HubSpot Contact** | **Notion Page** | Vue 360 organisee en sections, historique timeline |
| Scan Checker | **Revolut Receipt Scan** | **Expensify** | Camera native, OCR-to-form, 2-tap workflow |
| Navigation | **Linear Sidebar** | **Arc Browser** | Icones SVG, spaces/teams, Cmd+K omnipresent |
| Compta | **Stripe Billing** | **Wave Accounting** | P&L clair, export pro, comparaisons temporelles |
| Notifications | **Notion Updates** | **Linear Inbox** | Feed structure, filtres par type, historique complet |

---

*"Simplicity is the ultimate sophistication." — Leonardo da Vinci*

*DADASH V2 a la sophistication. Il lui manque la simplicite.*
