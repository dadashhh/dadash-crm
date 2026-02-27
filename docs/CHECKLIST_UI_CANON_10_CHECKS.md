# Checklist manuelle — UI canonique (post-merge)

Après merge de la PR "fix: babel + UI canon v_activity_feed + v_spenders_canon", exécuter ces 10 vérifications manuelles.

## 1. Fix crash Babel
- [ ] Ouvrir le site (index.html) — pas de crash "Nullish coalescing operator requires parens"
- [ ] Vérifier la console : aucune erreur Babel au chargement

## 2. Activity — Nouveaux spenders
- [ ] Cliquer sur la barre "Activités"
- [ ] Onglet "Nouveaux spenders" : les items affichent un titre (username ou tg_XXX)
- [ ] Le détail n’est plus "Message — Message" ou "Profil mis à jour — Profil mis à jour"
- [ ] Le temps relatif s’affiche (il y a X min)

## 3. Activity — Enrichissements
- [ ] Onglet "Enrichissements" : les items montrent le détail des champs enrichis
- [ ] Exemple attendu : "enriched: +status.relation, +language, +notes_chatter" ou similaire
- [ ] Pas de placeholder générique

## 4. Activity — Messages
- [ ] Onglet "Messages" : le contenu réel du message s’affiche (tronqué à 120 car.)
- [ ] Direction visible : [in] ou [out] + extrait du texte
- [ ] Pas de "Message — Message"

## 5. Fiche Spender — Autofill
- [ ] Ouvrir un spender enrichi (depuis Activity ou liste)
- [ ] Vérifier : prénom, âge, job, langue, relation, notes sont pré-remplis
- [ ] Les champs viennent de meta.profile / meta.enrich (v_spenders_canon)

## 6. Badge AUTO
- [ ] Sur un spender avec meta.enrich.last, le badge "AUTO" apparaît à côté des badges TG/WA
- [ ] Couleur verte (success)

## 7. Sync TG
- [ ] Cliquer sur "Sync TG"
- [ ] Toast "Sync TG OK" ou erreur explicite
- [ ] L’Activity et la liste des spenders se rafraîchissent sans hard refresh
- [ ] Pas besoin de F5 pour voir les mises à jour

## 8. Spender par tg_user_id
- [ ] Cliquer sur un item Activity (ex. message) → ouverture de la fiche spender
- [ ] La fiche correspond au bon spender (tg_user_id)

## 9. Libellés
- [ ] Onglets Activity : "Nouveaux spenders", "Enrichissements", "Messages"

## 10. Fallback v_spenders
- [ ] Si v_spenders_canon n’existe pas (migration non appliquée), le site utilise v_spenders
- [ ] Pas de crash, affichage correct des spenders
