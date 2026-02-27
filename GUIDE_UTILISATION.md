## TCG Backend API – Guide d’utilisation (étudiant)

Ce projet est une API backend pour un jeu de cartes façon Pokémon TCG, avec :

- **API REST** (auth, cartes, decks)
- **Socket.io** pour le matchmaking et le jeu en temps réel
- **Base de données PostgreSQL** gérée avec **Prisma**

---

## 1. Installer le projet en local

1. **Cloner le dépôt**

```bash
git clone https://github.com/iutcalais-offroy/nodejs-api-pokedex-Mapbaya.git
cd nodejs-api-pokedex-Mapbaya
```

2. **Installer les dépendances**

```bash
npm install
```

3. **Créer le fichier `.env` à partir de l’exemple**

```bash
cp .env.example .env
```

Puis adapter les variables si besoin (port, URL de base de données…).  
Le fichier `.env` **ne doit pas être versionné** (il est déjà dans `.gitignore`).

4. **Lancer la base de données PostgreSQL avec Docker**

```bash
npm run db:start
```

5. **Appliquer les migrations et le seed (users, cartes, decks)**

```bash
npm run db:reset
```

6. **Démarrer le serveur en développement**

```bash
npm run dev
```

Le backend tourne alors sur : `http://localhost:3001`.

---

## 2. Utiliser l’API et le jeu

### 2.1. En local

- **Swagger (documentation REST)** : `http://localhost:3001/api-docs`
- **Client Socket.io de test** : `http://localhost:3001/`
- **Healthcheck** : `http://localhost:3001/api/health`

Comptes de démo après le seed :

- `red@example.com` / `password123`
- `blue@example.com` / `password123`

#### Tester rapidement le matchmaking / jeu

1. Lancer `npm run dev`.
2. Ouvrir **deux onglets en navigation privée** sur `http://localhost:3001/`.
3. Dans chaque onglet :
   - Se connecter avec un des comptes de démo (formulaire “Sign In & Connect”).
4. Onglet 1 : créer une room avec un deck valide (`deckId = 1` par exemple).
5. Onglet 2 : récupérer la liste des rooms et rejoindre avec `joinRoom`.
6. Utiliser ensuite les boutons/événements :
   - `drawCards` pour piocher (max 5 cartes en main)
   - `playCard` pour poser une carte active
   - `attack` pour attaquer l’adversaire
   - `endTurn` pour passer son tour

Le serveur envoie les mises à jour (`gameStateUpdated`, `gameEnded`) aux deux joueurs.

### 2.2. Déploiement Railway

Une version déployée est disponible à l’adresse :

- **API + client Socket.io** : `https://nodejs-api-pokedex-mapbaya-production.up.railway.app`
- **Swagger** : `https://nodejs-api-pokedex-mapbaya-production.up.railway.app/api-docs`

Le fonctionnement est similaire à la version locale, mais la base de données et le seed sont gérés via Docker + Prisma dans le conteneur.



