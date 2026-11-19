# Lunii Story Studio

> **Projet personnel non officiel**, sans lien avec Lunii ni approuvé par Lunii. « Lunii » est une
> marque de son propriétaire ; elle est citée ici uniquement pour indiquer la compatibilité.

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

## Écriture des histoires : votre clé API Anthropic

Les histoires sont écrites par Claude avec **votre propre clé API Anthropic** : créez-la sur la
[console Anthropic](https://console.anthropic.com/settings/keys), puis collez-la dans l'écran
**Réglages** de l'application. Chaque génération est facturée sur votre compte Anthropic.
Aucune clé n'est fournie avec le projet.

Sous Windows, si PowerShell refuse `npm` (« l'exécution de scripts est désactivée »), tapez
`npm.cmd` à la place : `npm.cmd install`, `npm.cmd run app`, etc.

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
| Anthropic (Claude) | écriture des scénarios et des histoires | oui |
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

## Licence

Code publié sous [licence MIT](LICENSE) : libre d'utilisation, de modification et de partage,
sans garantie. Les services utilisés (Anthropic, Google Gemini, ElevenLabs, Voicebox, Piper,
STUdio) gardent leurs propres conditions.
