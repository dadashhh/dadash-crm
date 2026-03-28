# AUDIT 2/4 — Routes, Navigation & Composants Orphelins

**Date** : 2026-03-28
**Fichier** : `index.html` (65 852 lignes)
**Mode** : Read-only

---

## Systeme de routing

- **Type** : Custom hash-based routing (PAS de React Router)
- **Variable principale** : `tab` (L.63220) — `const [tab, _setTab] = useState("dashboard")`
- **Variable secondaire** : `subTab` (L.63221) — sous-pages au sein d'un onglet principal
- **Permissions** : `canSeeWithPerms(role, tabId, myPerms)` (L.8299-8306)
- **Navigation** : `navigateTo(pageId, subTabId)` pour le gerant (L.63265-63275), `setTab(tabId)` pour les autres roles
- **Persistance URL** : `window.history.pushState({tab: newTab}, "", #${newTab})` + popstate listener (L.63324-63393)
- **Deep linking** : Hash parsing (L.63335), pattern matching `/spenders/{uuid}` (L.63371)

### ROLE_ACCESS (L.8262-8269)

```
gerant:          dashboard, business, equipe, messagerie, compta, bots, scripts, admin
admin/ceo:       admin
modele:          model_checklist, model_content, model_tasks, model_payments, model_compta, model_notif
chatter:         chatter_dashboard, chatter_transactions, chatter_spenders, messagerie, chatter_compta, chatter_competition, chatter_scan, chatter_notif
provider:        provider_dashboard, provider_compta, provider_factures, provider_notif
manager_chatter: mc_dashboard, mc_chatters, mc_transactions, mc_solde
```

### PAGE_TABS — sous-onglets gerant (L.8512-8547)

```
dashboard: analytics, operations
business:  transactions, spenders, zoo
equipe:    chatters, modeles, providers, catalogue
compta:    pnl, paiements, factures, resultats
bots:      bots, ia_insights
admin:     users, roles, suggestions, logs, export, platforms, settings
```

---

## Cartographie par role

### Gerant (8 pages principales, 22 sous-onglets)

| # | Page | Sous-onglets | Lignes rendu | Sidebar desktop | Mobile bottom | Mobile Plus | Statut |
|---|------|-------------|-------------|----------------|--------------|-------------|--------|
| 1 | dashboard | analytics, operations | L.64928-64929 | L.65081 | L.65264 (Dash) | L.65312 (GERANT_NAV) | ACTIVE |
| 2 | business/transactions | — | L.64934 | L.65088 | L.65264 (Business) | L.65312 | ACTIVE |
| 3 | business/spenders | — | L.64935 | L.65084 | (via business) | L.65312 | ACTIVE |
| 4 | business/zoo | — | L.64936 | — | — | — | ACTIVE (via tab bar) |
| 5 | equipe/chatters | — | L.64940 | L.65093 | L.65264 (Equipe) | L.65312 | ACTIVE |
| 6 | equipe/modeles | — | L.64941 | L.65096 | (via equipe) | L.65312 | ACTIVE |
| 7 | equipe/providers | — | L.64942 | L.65099 | (via equipe) | L.65312 | ACTIVE |
| 8 | equipe/catalogue | — | L.64943 | L.65102 | (via equipe) | L.65312 | ACTIVE |
| 9 | messagerie | hub | L.64946 | L.65116 | L.65264 (Messagerie) | L.65312 | ACTIVE |
| 10 | compta/pnl | — | L.64958 | L.65107 | L.65264 (Compta) | L.65312 | ACTIVE |
| 11 | compta/paiements | paies, reversements, paiements_internes, ledger_interne | L.64959 | (via compta) | (via compta) | L.65312 | ACTIVE |
| 12 | compta/factures | — | L.64960 | (via compta) | (via compta) | L.65312 | ACTIVE |
| 13 | compta/resultats | resultats_dadash | L.64961 | (via compta) | (via compta) | L.65312 | ACTIVE |
| 14 | bots/bots | — | L.64971 | — | — | L.65312 (Bots) | ACTIVE |
| 15 | bots/ia_insights | — | L.64972 | L.65110 | — | L.65312 | ACTIVE |
| 16 | scripts | — | L.64975 | — | — | L.65312 (Scripts) | ACTIVE |
| 17 | admin | 7 sous-onglets | L.64977 | L.65120 (Parametres) | — | L.65312 (Admin) | ACTIVE |

**Legacy redirects (gerant):**
| Route legacy | Redirige vers | Ligne |
|-------------|--------------|-------|
| `spenders` | business/spenders | L.64926-64927 |
| `business/catalogue` | equipe/catalogue | L.64932 |
| `automation` | messagerie/push | L.64964-64965 |
| `ia-insights` | bots/ia_insights | L.64967-64968 |

### Admin/CEO (1 page)

| # | Page | Lignes rendu | Sidebar desktop | Statut |
|---|------|-------------|----------------|--------|
| 1 | admin | L.65497 | L.65128 | ACTIVE |

### Chatter (8 pages + 1 morte)

| # | Page | Lignes rendu | Sidebar desktop | Mobile Plus | Statut |
|---|------|-------------|----------------|-------------|--------|
| 1 | chatter_dashboard | L.65516 | L.65137 | L.65319 (otherTabs) | ACTIVE |
| 2 | chatter_transactions | L.65517 | L.65148 | L.65319 | ACTIVE |
| 3 | chatter_spenders | L.65518 | L.65140 | L.65319 | ACTIVE |
| 4 | messagerie | L.65495 | L.65143 | L.65319 | ACTIVE |
| 5 | chatter_compta | L.65529 | L.65152 | L.65319 | ACTIVE |
| 6 | chatter_competition | L.65537 | L.65155 | L.65319 | ACTIVE |
| 7 | chatter_scan | L.65538 | L.65160 | L.65319 | ACTIVE |
| 8 | chatter_notif | L.65536 | L.65163 | L.65319 | ACTIVE |
| 9 | **chatter_messagerie** | L.65519-65528 | **AUCUN** | **AUCUN** | **MORTE** |

### Manager Chatter (4 pages)

| # | Page | Lignes rendu | Sidebar desktop | Statut |
|---|------|-------------|----------------|--------|
| 1 | mc_dashboard | L.65540-65541 | L.65174 | ACTIVE |
| 2 | mc_chatters | L.65543-65552 | L.65177 | ACTIVE |
| 3 | mc_transactions | L.65554-65555 | L.65181 | ACTIVE |
| 4 | mc_solde | L.65557-65558 | L.65186 | ACTIVE |

**Bug sidebar MC** : `<div className="s-sec">SUPERVISION</div>` est duplique (L.65172 + L.65173).

### Modele (6 pages + 1 morte)

| # | Page | Lignes rendu | Sidebar desktop | Mobile Plus | Statut |
|---|------|-------------|----------------|-------------|--------|
| 1 | model_checklist | L.65499 | L.65194 | L.65319 | ACTIVE |
| 2 | model_content | L.65501 | L.65197 | L.65319 | ACTIVE |
| 3 | model_tasks | L.65500 | L.65200 | L.65319 | ACTIVE |
| 4 | model_payments | L.65503 | L.65204 | L.65319 | ACTIVE |
| 5 | model_compta | L.65571 | L.65207 | L.65319 | ACTIVE |
| 6 | model_notif | L.65570 | L.65212 | L.65319 | ACTIVE |
| 7 | **model_dashboard** | L.65502 | **AUCUN** | L.64736 (otherTabs) | **MORTE** |

> `model_dashboard` est dans `otherTabs` (L.64736) et dans `TAB_TO_FEATURE` (L.8281) mais **pas** dans `ROLE_ACCESS` (L.8266) et **pas** dans la sidebar modele (L.65192-65217). Il n'est accessible que si le role modele tombe dans le fallback sidebar (ce qui n'arrive pas car il a sa sidebar dediee). Route morte.

### Provider (4 pages)

| # | Page | Lignes rendu | Sidebar desktop | Statut |
|---|------|-------------|----------------|--------|
| 1 | provider_dashboard | L.65561 | L.65222 | ACTIVE |
| 2 | provider_compta | L.65563-65564 | L.65226 | ACTIVE |
| 3 | provider_factures | L.65566-65567 | L.65229 | ACTIVE |
| 4 | provider_notif | L.65569 | L.65234 | ACTIVE |

---

## Routes mortes

| Page | Role | Lignes rendu | Raison |
|------|------|-------------|--------|
| `chatter_messagerie` | chatter | L.65519-65528 | Aucun lien de nav, pas dans ROLE_ACCESS, aucun bouton n'y pointe. Code mort (~10 lignes de rendu avec 3 sous-tabs : dadash_live, whatsapp, escalades) |
| `model_dashboard` | modele | L.65502 | Dans otherTabs (L.64736) mais pas dans ROLE_ACCESS ni dans la sidebar modele. Inaccessible. Rend `<ModelDashboardTab>` |
| `spenders` (legacy) | gerant | L.64926-64927 | Redirect vers business/spenders — pas mort mais code legacy gardable pour retrocompat URL |
| `automation` (legacy) | gerant | L.64964-64965 | Redirect vers messagerie/push — idem |
| `ia-insights` (legacy) | gerant | L.64967-64968 | Redirect vers bots/ia_insights — idem |

**Total routes veritablement mortes : 2** (`chatter_messagerie`, `model_dashboard`)
**Redirects legacy conservables : 3** (retro-compat URL)

---

## Composants "a venir" / placeholders

| Ligne | Contexte | Type |
|-------|---------|------|
| L.40689 | "coming soon" — Real-time activity tracking (Live Activity) | Feature placeholder dans une page active |
| L.40698 | "coming soon" — Action history (Logs section) | Feature placeholder dans une page active |
| L.53227 | "coming soon" — Upload feature | Feature placeholder |
| L.55836 | "coming soon" — Stats dans modal modele (bientot disponible) | Feature placeholder |
| L.56212 | "coming soon" — Mode UI screenshot upload (bientot disponible) | Feature placeholder |

> Aucune page entiere n'est un placeholder vide. Les "coming soon" sont des features au sein de pages actives.

---

## Composants orphelins

Composants definis (const/function avec majuscule) mais **jamais rendus en JSX** (`<NomComposant` introuvable) et sans reference fonctionnelle verifiee.

> Verification approfondie effectuee : chaque composant a ete controle pour l'usage JSX (`<Nom`), `React.createElement(Nom`, appels de fonction, et references dans du code de sous-pages.

| # | Composant | Ligne | Taille (~lignes) | Verdict |
|---|-----------|-------|-----------------|---------|
| 1 | TelegramTab | L.23014 | ~1185 | ORPHELIN |
| 2 | MesSpendersTab | L.18835 | ~965 | ORPHELIN |
| 3 | MessagerieGerantAdminPanel | L.49731 | ~870 | ORPHELIN |
| 4 | WhatsAppAnalyzerTab | L.56493 | ~710 | ORPHELIN |
| 5 | PayesTab | L.20171 | ~630 | ORPHELIN |
| 6 | ModelManagementTab | L.53524 | ~475 | ORPHELIN |
| 7 | PushPageV1 | L.59816 | ~385 | ORPHELIN |
| 8 | VideosTab | L.58593 | ~310 | ORPHELIN |
| 9 | DashboardAnalytics | L.11024 | ~280 | ORPHELIN |
| 10 | ExportRapportsTab | L.8680 | ~270 | ORPHELIN |
| 11 | ProviderNewTxModal | L.25454 | ~245 | ORPHELIN |
| 12 | LogsAuditTab | L.8950 | ~200 | ORPHELIN |
| 13 | ObjectifsTab | L.19886 | ~155 | ORPHELIN |
| 14 | ComptaProvidersTab | L.57936 | ~155 | ORPHELIN |
| 15 | AgentsAuditTab | L.27913 | ~140 | ORPHELIN |
| 16 | BroadcastAnalytics | L.48715 | ~135 | ORPHELIN |
| 17 | BroadcastsTab | L.55306 | ~125 | ORPHELIN |
| 18 | ChallengesSection | L.54449 | ~95 | ORPHELIN |
| 19 | ContentTaskManager | L.53435 | ~85 | ORPHELIN |
| 20 | GerantPayoutRequestsPanel | L.57870 | ~63 | ORPHELIN |
| 21 | AgencyAchievements | L.54345 | ~54 | ORPHELIN |
| 22 | ActivityHeatmap | L.54403 | ~42 | ORPHELIN |
| 23 | AgencyHealthScore | L.54303 | ~38 | ORPHELIN |
| 24 | BotStatsKPIs | L.10945 | ~37 | ORPHELIN |
| 25 | FilterBar | L.10723 | ~31 | ORPHELIN (GlobalFilterBar est utilise a la place) |
| 26 | ScansTab | L.56334 | ~14 | ORPHELIN |
| 27 | PlaceholderTab | L.9147 | ~7 | ORPHELIN |

**Total : 27 composants orphelins, ~6 720 lignes recuperables**

**Composants exclus apres verification approfondie (faux positifs initiaux) :**

| Composant | Ligne | Raison de l'exclusion |
|-----------|-------|----------------------|
| ChartComp | L.62479 | Variable dynamique (BarChart/LineChart), utilisee `React.createElement(ChartComp,...)` L.62481 |
| JsPDF | L.24356 | Reference locale a `window.jspdf`, utilisee L.24357-24359 |
| VarBadge | L.12668 | Composant local, utilise via `React.createElement` L.12756, 12765, 12796, 12805 |
| ChatterDashboardRedesign | L.30398 | Utilise via `React.createElement(ChatterDashboardRedesign,...)` L.31124 |
| CompetitionTab | L.20045 | Composant de base pour ChatterCompetitionTab |
| GerantMessagerieTab | L.31659 | Utilise dans la logique de sous-pages (L.31723, 31732, 31741, 31752) |
| TgCarlosMessagerieTab | L.45562 | Utilise dans la logique de sous-pages (L.45759, 45772, 45781, 45830) |
| LedgerTab | L.51031 | Utilise dans le rendu comptabilite (ReceiverComptaTab) |
| PaymentEventsSection | L.51680 | Utilise dans le rendu comptabilite (ReceiverComptaTab) |
| MediaLibraryPage | L.48111 | Reference dans le code et commentaires, utilise en contexte |
| MediaThumbnail | L.33904 | Alias de MediaCard, reference L.33720 |
| MiniSparkline | L.8252 | Utilise via `React.createElement(MiniSparkline,...)` L.12751+ |
| SpenderFullProfile | L.22845 | Reference et utilise dans le code CRM |
| SpenderQuickCard | L.22816 | Reference et utilise dans le code Telegram |

---

## Etats morts (zone MC L.62000-65000 + legacy)

| State | Ligne | Setter appele ? | Valeur lue ? | Verdict |
|-------|-------|----------------|-------------|---------|
| `model_dashboard` dans otherTabs | L.64736 | OUI (setTab) | OUI (render L.65502) | Route morte — le state fonctionne mais la page est inaccessible |
| `chatter_messagerie` | L.65519 | NON (aucun setTab("chatter_messagerie") trouve) | OUI (render conditionnel) | Route morte — aucun code ne navigue vers cette page |

> Note : Les 1222 `useState` du fichier n'ont pas ete audites individuellement (scope d'un audit dedie). L'audit se concentre sur les states lies aux routes mortes.

---

## Routes dupliquees

Aucune duplication de route veritable trouvee. Les redirects legacy (`spenders` -> `business/spenders`, `automation` -> `messagerie/push`, `ia-insights` -> `bots/ia_insights`) redirigent proprement sans rendre deux fois le meme composant.

Le sous-onglet `compta/paiements` accepte 5 valeurs de subTab (`paiements`, `paies`, `reversements`, `paiements_internes`, `ledger_interne`) mais elles rendent toutes le meme composant `<PaiementsHubTab>` (L.64959). C'est un choix de design (hub interne), pas une duplication.

---

## RESUME

| Metrique | Valeur |
|---------|--------|
| **Pages actives** | 31 (gerant: 17, admin: 1, chatter: 8, mc: 4, modele: 6, provider: 4 — certaines partagees) |
| **Pages mortes** | 2 (`chatter_messagerie`, `model_dashboard`) |
| **Redirects legacy** | 3 (conservables pour retro-compat URL) |
| **Composants orphelins** | 27 |
| **Lignes orphelines estimees** | **~6 720 lignes** |
| **Placeholders "coming soon"** | 5 (features partielles, pas des pages entieres) |
| **Bug sidebar trouve** | 1 (doublon `SUPERVISION` L.65172-65173 dans MC sidebar) |
| **Total code mort estime** | **~6 720 lignes (~10.2% du fichier)** |

### Recommandations de nettoyage

1. **Priorite haute** — Supprimer les 27 composants orphelins (~6 720 lignes). Les plus gros :
   - `TelegramTab` (~1185 lignes, L.23014)
   - `MesSpendersTab` (~965 lignes, L.18835)
   - `MessagerieGerantAdminPanel` (~870 lignes, L.49731)
   - `WhatsAppAnalyzerTab` (~710 lignes, L.56493)
   - `PayesTab` (~630 lignes, L.20171)

2. **Priorite moyenne** — Supprimer les 2 routes mortes :
   - `chatter_messagerie` (L.65519-65528) : code de rendu + references dans otherTabs
   - `model_dashboard` (L.65502) : code de rendu + entree otherTabs (L.64736) + TAB_TO_FEATURE (L.8281)

3. **Priorite basse** — Corriger le bug du doublon `SUPERVISION` (L.65172-65173) dans la sidebar MC.

4. **A evaluer** — Les 3 redirects legacy (`spenders`, `automation`, `ia-insights`) peuvent etre conservees pour la retro-compatibilite URL ou supprimees si plus personne ne bookmarke ces anciennes URLs.
