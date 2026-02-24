# Outils de test — Messagerie Telegram

## Accès

- **Page :** Messagerie → Admin Panel
- **Visible :** Gérant uniquement

## Prérequis

1. Renseigner **Bot Base URL** (ex. `https://bot.example.com`)
2. Renseigner **X-DADASH-KEY** (clé API)
3. Cliquer sur **Sauvegarder config**

> La clé est masquée après sauvegarde. Pour la modifier, saisir la nouvelle valeur puis sauvegarder.

## Boutons

| Bouton | Action |
|--------|--------|
| **Tester endpoint bot status** | Appel GET `/bot/status` — vérifie que le bot répond et est en ligne |
| **Tester endpoint send (dry-run)** | Appel POST `/sendMessage` avec `dry_run: true` — vérifie l’endpoint d’envoi. Si dry-run non supporté → message "Endpoint présent, dry-run non supporté" |
| **Rafraîchir conversations Telegram** | Recharge la liste des conversations depuis Supabase |

## Affichage du dernier test

- **Statut :** OK (vert) ou Erreur (rouge)
- **Code HTTP :** si disponible
- **Heure :** heure du test
- **Message :** résumé (ex. "Bot en ligne", "Timeout", "Clé invalide")

## Cas d’erreur

- **Bot URL non configurée** → Renseigner l’URL dans la section "Connexion backend bot"
- **Clé X-DADASH-KEY manquante** → Saisir la clé puis sauvegarder
- **HTTP 401** → Clé invalide ou expirée
- **Timeout** → Endpoint inaccessible ou réseau lent
