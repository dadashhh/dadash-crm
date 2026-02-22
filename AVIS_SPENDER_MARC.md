# AVIS SPENDER — MARC (Agent 3)

**Date** : 22 fevrier 2026
**Plateforme testee** : [dadash.co](https://dadash.co)
**Role** : Spender/Client — 34 ans, 200-500 CHF/mois, Twint, cam + scripts progressifs

---

## Scores Globaux

| Critere | Note /10 | Commentaire |
|---------|----------|-------------|
| **Conversation IA** | 5/10 | Pas d'IA conversationnelle visible cote spender — aucun chatbot, aucun agent Telegram testable depuis l'interface |
| **Realisme** | 4/10 | L'interface est un back-office gerant/chatter, pas une experience spender. Je ne me sens pas "client" |
| **Vente / Upsell** | 3/10 | Aucun mecanisme d'upsell automatique. Pas de suggestions de produits, pas de "tu pourrais aimer ca" |

---

## 1. Experience Globale — Le Point de Vue du Spender

### Ce que j'ai teste

Je suis arrive sur dadash.co en pensant trouver une interface ou je pourrais interagir en tant que client (Marc). Ce que j'ai trouve :

- **Page de login** : Dark mode, design propre, branding "DADASH - Pushy Team". Visuellement solide.
- **Aucun acces spender** : Pas de compte spender, pas de portail client. C'est un CRM interne pour gerants, chatters et modeles.
- **Pas d'IA conversationnelle accessible** : Le chatbot Carla sur Telegram n'est pas testable depuis l'interface web.

### Verdict brut

En tant que Marc, je n'ai **aucune interface dediee**. Tout passe par Telegram (que je ne peux pas tester ici). Le CRM me traite comme une ligne dans un tableau, pas comme un client VIP.

---

## 2. Ce Que Le CRM Sait de Moi (Analyse du Profil Spender)

### Donnees collectees sur un spender

| Champ | Present | Commentaire |
|-------|---------|-------------|
| Handle/Username | Oui | Affiche en majuscules sur la carte |
| LTV (Lifetime Value) | Oui | Calcul automatique, gros chiffre visible |
| Score VIP (0-100) | Oui | Barre coloree, formule basee sur LTV/frequence/recence/panier moyen |
| Badges | Oui | WHALE (>500), ACTIF, INACTIF, NOUVEAU, REGULIER, SCAM |
| Langue | Oui | FR/DE/EN/IT — mais pas de personnalisation basee dessus |
| Historique transactions | Oui | Liste complete avec montants, produits, dates |
| Sparkline activite | Oui | Mini-graphique sur la carte — bon visuel |
| Preferences produit | Non | Pas de tracking de ce que j'aime (cam vs sexting vs pack) |
| Notes personnelles | Partiellement | Champ notes dans la transaction, mais pas de "fiche client" |
| Historique conversation | Non | Pas de lien vers les logs Telegram |

### Ce qui manque cruellement

- **Preferences de contenu** : Si je suis un accro de la cam douche, le CRM devrait le savoir
- **Horaires favoris** : Je contacte toujours a 22h ? Le CRM ne le sait pas
- **Historique de conversation** : Aucun lien entre mes transactions et mes discussions Telegram
- **Score de satisfaction** : Aucun feedback loop — on ne me demande jamais si j'ai aime
- **Alertes de churn** : Le badge INACTIF apparait apres 30 jours, mais c'est trop tard

---

## 3. Top 5 Moments ou l'Interface Etait Convaincante

1. **Le design sombre premium** : L'interface est belle. Vraiment. Le dark mode avec les accents indigo donne un sentiment de luxe. En tant que spender VIP, je veux que mon argent aille vers une operation pro — ca donne confiance.

2. **Le score VIP avec barre coloree** : La formule (LTV 40% + Frequence 25% + Recence 20% + Panier moyen 15%) est intelligente. Voir que je suis a 85/100 me donnerait envie de maintenir mon statut si j'avais acces a cette info.

3. **Le systeme de badges** : WHALE avec l'emoji baleine, c'est flatteur. Si un chatter me dit "t'es notre whale prefere", ca marche psychologiquement. Le badge ACTIF avec le feu aussi — ca donne envie de rester dans la course.

4. **La verification de screenshot** : Le flow Twint → screenshot → validation est propre. En tant que payeur Twint, c'est exactement ce que je fais. Le statut en couleur (vert/orange/rouge) est clair.

5. **Le catalogue de produits structure** : Cam (douche/chambre/salon × 5/10/15 min) + Sexting (script avec tenues) + Packs. C'est organise, ca me permet de savoir ce qui est dispo. Bonne granularite.

---

## 4. Top 5 Moments ou le Systeme a Failli

1. **Pas de portail spender** : C'est le probleme numero 1. En 2026, un client qui depense 500 CHF/mois devrait avoir un espace perso. Voir son historique, ses contenus achetes, son statut VIP. La il n'y a RIEN. Je suis invisible sauf dans le back-office d'un chatter.

2. **Pas de prix visibles** : Le catalogue liste "Cam douche 5 min" mais aucun prix. En tant que Marc, je veux savoir combien ca coute AVANT de negocier. L'absence de prix me fait penser que c'est de l'arnaque — les prix changent selon la tete du client.

3. **Aucune IA conversationnelle testable** : Le brief dit "ecris a Carla sur Telegram, c'est l'IA qui repond" — mais je ne peux pas tester ca depuis le CRM. Ou est le bot ? Ou est l'integration ? Le CRM ne me montre meme pas les conversations passees.

4. **Pas de rappel automatique** : Si je suis inactif depuis 15 jours, personne ne me relance automatiquement. Le CRM a un champ "broadcast" mais c'est manuel. Un spender a 500 CHF/mois qui part, c'est une perte de 6000 CHF/an — ca merite un rappel automatise.

5. **Session persistence desactivee** : `persistSession: false` dans le code Supabase. Ca veut dire qu'a chaque fois que je ferme l'onglet, je dois me reconnecter. Pour un outil utilise 10x/jour par les chatters, c'est un tue-productivite enorme.

---

## 5. Analyse Detaillee par Fonctionnalite

### 5.1 Systeme de Paiement / Twint

| Aspect | Etat | Note |
|--------|------|------|
| Twint comme methode principale | OK | Liste en premier, couleur verte |
| Screenshot upload | Fonctionnel | Via le systeme de scan |
| Validation du paiement | Fonctionnel | 3 statuts : validated/pending/rejected |
| Confirmation au spender | ABSENT | Aucune notification push/Telegram au spender apres validation |
| Historique paiements spender | ABSENT | Pas de vue spender-side de ses paiements |

**Probleme critique** : Apres avoir paye par Twint et envoye le screenshot, je n'ai AUCUN retour automatique. Est-ce que c'est valide ? Est-ce que mon contenu arrive ? Silence radio. Ca cree de l'anxiete et ca pousse a aller voir ailleurs.

### 5.2 Catalogue Produits

**Points positifs** :
- Structure claire : 3 categories, tags precis
- La cam est decoupee par lieu ET duree — granularite utile

**Points negatifs** :
- Tout est hardcode dans le JavaScript — ajouter un nouveau produit = modifier le code
- Pas de photos/previews pour les packs
- Pas de "best-seller" ou "nouveau" pour guider le choix
- Pas de bundle/combo (ex: "cam 10 min + pack solo" a prix reduit)

### 5.3 Gestion des Sessions Cam

Le CRM n'a **aucun suivi de session cam en temps reel** :
- Pas de timer de session
- Pas d'indicateur "en live"
- Pas de qualite de connexion
- Pas de bouton "prolonger la session" pour le spender
- Pas de rating post-session

En tant que Marc, quand je paye 200 CHF pour une cam de 15 min, je veux savoir que les 15 min sont respectees. Aucun mecanisme de controle.

### 5.4 Recherche et Filtrage des Spenders

- Recherche basique par `includes()` — pas de recherche floue
- Pas de segments sauvegardes ("mes whales Twint", "inactifs >15j", "amateurs de cam")
- Pas de tri par produit prefere
- Pas d'export filtre (ex: exporter seulement les spenders inactifs pour une campagne)

---

## 6. Bugs et Problemes Techniques

### Bugs Critiques

| # | Bug | Impact | Severite |
|---|-----|--------|----------|
| 1 | `persistSession: false` — deconnexion a chaque fermeture d'onglet | Perte de productivite chatters | CRITIQUE |
| 2 | Pas de mot de passe oublie / reset | Utilisateurs bloques | CRITIQUE |
| 3 | Fallback Supabase stub en cas de panne reseau — l'app affiche des donnees vides sans erreur | Decisions basees sur des donnees fausses | CRITIQUE |
| 4 | `downloadInvoicePDF()` non definie — export PDF casse | Impossible de generer des factures | HAUTE |
| 5 | Taux de change EUR/CHF hardcode a 0.94 | Erreurs de calcul sur les marges | HAUTE |

### Bugs UX

| # | Bug | Impact |
|---|-----|--------|
| 6 | FAB (bouton flottant) chevauche le contenu en bas de page sur mobile | Zone morte de 144px en bas |
| 7 | Pas de skeleton loader — ecran blanc pendant le chargement | Impression de lenteur |
| 8 | Toast disparait apres 3s — facile de rater une alerte critique | Erreurs ignorees |
| 9 | Montants negatifs acceptes dans les formulaires | Donnees corrompues |
| 10 | Pas de debounce sur la recherche — spam de requetes API | Performance degradee |

### Problemes d'Accessibilite

- Aucun `aria-label` sur les icones de la sidebar
- Indicateurs de statut bases uniquement sur la couleur (rouge/vert) — echec WCAG AA
- Labels de formulaire non relies aux inputs (`for` manquant)
- Pas de navigation clavier dans les modales

---

## 7. Suggestions pour Ameliorer la Personnalite (IA Carla)

Bien que je n'aie pas pu tester l'IA directement, voici ce que le CRM devrait supporter pour rendre Carla plus convaincante :

### 7.1 Donnees a Injecter dans l'IA

```
- Preferences produit du spender (cam/sexting/pack)
- Horaire habituel de contact
- Budget mensuel moyen
- Dernier achat (produit + date)
- Score VIP et badges
- Historique de negociation (a-t-il eu des remises ?)
- Langue preferee
- Sujets de discussion favoris (flirt, direct, timide)
```

### 7.2 Scenarios a Implementer

1. **Retour apres absence** : "Ca fait 2 semaines Marc... tu m'as manque 😏 J'ai quelque chose de special pour toi"
2. **Upsell intelligent** : "Tu as kiffe la cam douche la derniere fois ? J'ai un nouveau set lingerie rouge... tu veux voir ?"
3. **Urgence/rarete** : "Je fais des sessions privees que ce soir, il me reste 2 creneaux"
4. **Recompense fidelite** : "T'es mon client prefere ce mois-ci 🐋 — 5 min bonus sur ta prochaine cam"
5. **Anti-churn** : Detection automatique a J+7 d'inactivite, pas J+30

### 7.3 Ce Qui Me Ferait Decrocher (Red Flags IA)

- Reponses generiques non personnalisees
- Temps de reponse > 5 minutes
- Oubli de ce que j'ai dit dans la conversation
- Changement de ton brutal (flirt → commercial)
- Pas de memoire entre les sessions
- Prix qui changent sans explication

### 7.4 Ce Qui Me Ferait Depenser Plus

- Contenu exclusif "juste pour moi"
- Programme de fidelite visible (paliers de depense avec avantages)
- Previews/teasers avant achat
- Sessions cam avec possibilite de prolonger en live
- Bundles a prix reduit ("pack semaine" : 3 cams + 1 sexting)

---

## 8. Phrases/Reponses Problematiques

Comme l'IA n'est pas testable directement depuis le CRM, voici les elements problematiques que j'ai releves dans l'interface elle-meme :

| # | Element | Probleme | Suggestion |
|---|---------|----------|------------|
| 1 | "Pushy Team" dans le titre et meta tags | Nom visible publiquement — professionnel ? | Utiliser uniquement "DADASH" en public |
| 2 | `user-scalable=no` dans le viewport | Empeche le zoom — probleme accessibilite | Retirer cette restriction |
| 3 | "Accès refusé. Ce bot est réservé au gérant." | Message du bot trop sec | Adoucir : "Ce service n'est pas disponible pour le moment" |
| 4 | Placeholder Twint "+41 7X XXX XX XX" | Revele le format attendu — securite | Utiliser un placeholder generique |
| 5 | Labels de produits en francais uniquement | Le CRM supporte 6 langues mais le catalogue non | Traduire le catalogue produit |
| 6 | "SCAM" comme badge visible | Trop agressif si un chatter le montre accidentellement | Renommer en "ALERTE" ou cacher du front |
| 7 | `DADA_FEE_PCT = 10` visible dans le code source | Information commerciale sensible exposee | Deplacer cote serveur |

---

## 9. Comparaison avec la Concurrence

En tant que spender qui depense 200-500 CHF/mois, je compare avec ce que j'ai vu ailleurs :

| Fonctionnalite | DADASH | OnlyFans | Chaturbate | MYM |
|---------------|--------|----------|------------|-----|
| Portail client | Non | Oui | Oui | Oui |
| Historique achats | Non (cote spender) | Oui | Oui | Oui |
| Notifications | Non | Push + Email | Email | Push |
| Programme fidelite | Non | Non | Tokens | Non |
| Chat en temps reel | Via Telegram | In-app | In-app | In-app |
| Paiement integre | Twint (screenshot) | CB | Tokens | CB |
| Qualite UX | Back-office pro | Grand public | Basique | Moderne |

**Conclusion** : DADASH est un back-office, pas une plateforme client. Pour un spender comme moi, ca n'existe pas. Tout passe par Telegram, ce qui est bien pour la discretion mais terrible pour l'experience et la retention.

---

## 10. Recommandations Prioritaires

### Priorite 1 — Urgences (Cette Semaine)

1. **Activer `persistSession: true`** dans la config Supabase — un changement d'une ligne qui sauve des heures
2. **Ajouter un bouton "Mot de passe oublie"** sur la page de login
3. **Corriger le fallback Supabase** — afficher un message d'erreur au lieu de donnees vides
4. **Fixer le FAB mobile** — repositionner au-dessus de la barre de navigation

### Priorite 2 — Court Terme (Ce Mois)

5. **Ajouter les prix au catalogue** — meme des fourchettes de prix
6. **Creer un systeme de notification spender** — confirmation de paiement via Telegram bot
7. **Ajouter les preferences produit** au profil spender
8. **Implementer le debounce** sur la recherche
9. **Ajouter des skeleton loaders** pendant le chargement

### Priorite 3 — Moyen Terme (Ce Trimestre)

10. **Creer un mini-portail spender** — meme basique, avec historique et statut VIP
11. **Automatiser les relances** a J+7 d'inactivite
12. **Integrer les conversations Telegram** dans le CRM
13. **Ajouter un rating post-session** pour mesurer la satisfaction
14. **Creer des bundles/combos** dans le catalogue

### Priorite 4 — Long Terme

15. **Programme de fidelite** avec paliers visibles
16. **Segmentation avancee** avec segments sauvegardes et export cible
17. **Timer de session cam** en temps reel
18. **A/B testing** des messages de relance

---

## 11. Note Finale

**En tant que Marc, spender a 500 CHF/mois :**

> Le CRM est beau et bien construit pour les gerants et chatters. Mais pour moi, le client ? Je n'existe pas dans cette interface. Ma relation est 100% dependante de la qualite du chatter humain (ou de l'IA Carla) sur Telegram. Si Carla met 10 min a repondre ou oublie que j'ai achete une cam hier, je pars. Et le CRM ne s'en rendra compte que 30 jours plus tard, quand mon badge passera de ACTIF a INACTIF.
>
> La plus grande opportunite pour DADASH : transformer les donnees du CRM en intelligence pour l'IA. Le VIP score, les preferences, l'historique — tout ca devrait alimenter Carla en temps reel pour qu'elle me traite comme un VIP, pas comme un inconnu.
>
> Score final : **4/10** en tant que spender.
> Potentiel si les recommandations sont suivies : **8/10**.

---

*Rapport genere par Marc (Agent 3 — Spender/Client) le 22 fevrier 2026*
*Test effectue sur dadash.co — version actuelle en production*
