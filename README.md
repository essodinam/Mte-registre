# MTE Registre — version installable (PWA)

Cette version fonctionne en dehors de Claude, comme un vrai site que tu héberges toi-même.
Une fois déployée, n'importe qui l'ouvre sur son téléphone et peut l'**installer** (icône sur
l'écran d'accueil, lancement en plein écran, sans barre de navigateur).

Contrairement à la version Claude, les données (produits, ventes, vendeurs, code commerce...)
ne sont plus stockées dans l'artifact : elles vivent dans une base **Supabase** (gratuite pour
ce volume d'usage), pour que tous les appareils d'un même commerce restent synchronisés.

---

## 1. Créer la base de données (Supabase — gratuit)

1. Va sur [supabase.com](https://supabase.com) → crée un compte → "New project".
2. Une fois le projet créé, ouvre l'onglet **SQL Editor** et colle ce script, puis "Run" :

```sql
create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table kv_store enable row level security;

create policy "public read"   on kv_store for select using (true);
create policy "public write"  on kv_store for insert with check (true);
create policy "public update" on kv_store for update using (true) with check (true);
create policy "public delete" on kv_store for delete using (true);
```

3. Va dans **Project Settings → API** et note deux valeurs :
   - `Project URL`
   - `anon public` key

⚠️ **Important sur la sécurité** : ces règles ouvrent la table à quiconque possède la clé
`anon` (qui est publique, visible dans le code du site — c'est normal et attendu pour ce type
d'app). La vraie protection reste le **code commerce** à 8 caractères, exactement comme dans la
version Claude : quelqu'un qui devine ou intercepte ce code pourrait lire/modifier les données
de ce commerce. Si tu veux une vraie isolation garantie côté serveur (pas juste par obscurité
du code), il faudrait ajouter une authentification Supabase par commerce — un chantier
supplémentaire, dis-le-moi si tu veux qu'on le fasse.

---

## 2. Configurer le projet en local

Prérequis : [Node.js](https://nodejs.org) installé (version 18 ou plus).

```bash
cd mte-registre-pwa
npm install
cp .env.example .env
```

Ouvre `.env` et colle les deux valeurs récupérées à l'étape 1 :

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Teste en local :

```bash
npm run dev
```

Ouvre l'adresse affichée (ex. `http://localhost:5173`) dans ton navigateur.

---

## 3. Déployer en ligne (Vercel — gratuit)

1. Crée un compte sur [vercel.com](https://vercel.com) (tu peux te connecter avec GitHub).
2. Mets ce dossier dans un dépôt GitHub (ou utilise `vercel` en ligne de commande pour déployer
   directement sans GitHub — `npm i -g vercel` puis `vercel` dans le dossier du projet).
3. Dans Vercel, "Add New Project" → importe le dépôt.
4. Dans **Environment Variables**, ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` avec
   les mêmes valeurs que ton `.env`.
5. Clique "Deploy". Au bout d'une minute, tu obtiens une adresse du type
   `https://mte-registre.vercel.app` (tu peux ensuite y attacher ton propre nom de domaine dans
   les réglages du projet Vercel).

Netlify fonctionne de la même façon si tu préfères (build command `npm run build`, dossier de
sortie `dist`, mêmes variables d'environnement).

---

## 4. Installer l'application

Une fois le site en ligne, ouvre l'adresse sur le téléphone de chaque vendeur :

- **Android (Chrome)** : un bandeau "Installer l'application" apparaît automatiquement, ou via
  le menu ⋮ → "Installer l'application".
- **iPhone (Safari)** : bouton Partager → "Sur l'écran d'accueil".

L'icône générée (le monogramme "M" doré) est déjà incluse dans `public/icons/`. Tu peux la
remplacer par ton propre logo en gardant les mêmes noms de fichiers et tailles
(192×192, 512×512, et une version "maskable" 512×512).

---

## 5. Ce qui a changé par rapport à la version Claude

- Le stockage `window.storage` (propre aux artifacts Claude) a été remplacé par un module
  `src/storage.js` qui utilise Supabase pour les données du commerce, et le stockage local du
  navigateur uniquement pour retenir le code commerce sur cet appareil.
- Les différents appareils d'un même commerce se resynchronisent automatiquement toutes les
  20 secondes (au lieu d'un stockage géré nativement par Claude).
- **Le mode hors-ligne installe l'app et l'affiche même sans connexion, mais les données
  elles-mêmes (stock, ventes...) nécessitent une connexion internet** pour se charger et se
  sauvegarder — ce n'est pas une base de données locale complète.
