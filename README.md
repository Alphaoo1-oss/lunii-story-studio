# Lunii Story Studio

Application web locale pour créer des histoires interactives pour la Lunii : on décrit
l'histoire souhaitée, l'application propose des scénarios, écrit l'histoire à choix, prépare
les voix et les pictos, puis exporte un pack compatible STUdio.

**Pour commencer : le [démarrage rapide](docs/demarrage-rapide.md)** (une page). **Le [guide complet](docs/guide.md)** explique en détail comment l'application fonctionne,
comment l'installer et configurer chaque service, et comment la partager.

## Installation

Prérequis : [Node.js](https://nodejs.org) 24 ou plus récent.

```bash
npm install
```

## Lancement

```bash
npm run app
```

Puis ouvrir <http://127.0.0.1:5173> dans le navigateur.

Sous Windows, le plus simple est de double-cliquer sur **`Lancer Lunii Story Studio.cmd`** (ou sur
un raccourci vers ce fichier) : il lance l'application et ouvre le navigateur dès qu'elle est prête,
ou ouvre seulement la page si elle tourne déjà. Fermer sa fenêtre arrête l'application. Pour les
voix, lancez aussi Voicebox.

L'application n'est accessible que depuis cet ordinateur.

## Écriture des histoires : abonnement Claude

Par défaut, les histoires sont écrites avec **votre abonnement Claude** (Pro ou Max), sans clé API.
À faire une seule fois, dans un terminal ouvert dans le dossier du projet :

```bash
npm run claude:login
```

Sous Windows, si PowerShell refuse `npm` (« l'exécution de scripts est désactivée »), tapez
`npm.cmd` à la place : `npm.cmd run claude:login`, `npm.cmd run app`, etc.

Vérifiez ensuite la connexion dans **Réglages** (ou avec `npm run claude:status`). Les générations
comptent dans les limites de votre abonnement.

Ce mode est réservé à un **usage personnel** : Anthropic n'autorise pas une application partagée
avec d'autres personnes à utiliser la connexion claude.ai. Dans ce cas, choisissez « clé API »
dans les Réglages.

## Voix HD locales avec Voicebox

Pour des voix très naturelles et réutilisables d'une histoire à l'autre (Mamie, Papa, le narrateur…),
installez [Voicebox](https://voicebox.sh/download/windows) (gratuit, local), lancez-le et créez
vos profils de voix : à partir d'un enregistrement, d'une voix prédéfinie ou d'une description
(« mamie de 70 ans, douce et chaleureuse »). Dans la page **Voix**, choisissez ensuite
« Voicebox » puis le profil de chaque personnage. Voicebox doit être ouvert pendant la génération.

## Clés des services

Les clés se saisissent dans l'écran **Réglages** de l'application. On peut aussi copier
`.env.example` en `.env` et les y renseigner.

| Service | Utilisation | Obligatoire |
|---------|-------------|-------------|
| Anthropic (Claude) | écriture des histoires en mode « clé API » | non (l'abonnement Claude est utilisé par défaut) |
| ElevenLabs | voix de synthèse expressives | non (voix locale ou enregistrement possibles) |
| Google Gemini (Nano Banana) | génération des pictos | non (pictos par défaut ou images importées possibles) |

Les clés, les projets et les médias sont stockés dans le dossier `data/`, qui n'est jamais
versionné.

## Mettre l'histoire sur la Lunii

L'application exporte un fichier `.zip` au format STUdio. Importez-le avec
[STUdio](https://github.com/marian-m12l/studio) ou Lunii QT, puis transférez-le sur la Lunii.

## Tests

```bash
npm test
```

Les tests n'utilisent ni clé ni réseau.
