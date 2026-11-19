# Lunii Story Studio : guide complet

Ce guide explique ce que fait l'application, comment elle fonctionne, et comment l'installer et
la configurer sur un autre ordinateur. Il est écrit pour quelqu'un qui n'est pas développeur :
toutes les commandes sont données telles quelles.

## Sommaire

1. [Ce que fait l'application](#1-ce-que-fait-lapplication)
2. [Comment elle fonctionne](#2-comment-elle-fonctionne)
3. [Ce qu'il faut avant de commencer](#3-ce-quil-faut-avant-de-commencer)
4. [Installation](#4-installation)
5. [Lancer l'application chaque jour](#5-lancer-lapplication-chaque-jour)
6. [Écriture des histoires : Claude](#6-écriture-des-histoires--claude)
7. [Les voix](#7-les-voix)
8. [Les pictos](#8-les-pictos)
9. [La fiche famille](#9-la-fiche-famille)
10. [Créer une histoire, étape par étape](#10-créer-une-histoire-étape-par-étape)
11. [Mettre l'histoire sur la Lunii](#11-mettre-lhistoire-sur-la-lunii)
12. [Ma Lunii : ranger les histoires](#12-ma-lunii--ranger-les-histoires)
13. [Vos données et la confidentialité](#13-vos-données-et-la-confidentialité)
14. [Partager l'application](#14-partager-lapplication)
15. [Dépannage](#15-dépannage)
16. [Pour les développeurs](#16-pour-les-développeurs)

---

## 1. Ce que fait l'application

Lunii Story Studio crée des **histoires audio interactives** pour la
[Lunii](https://lunii.com), la boîte à histoires pour enfants. Interactives, cela veut dire qu'à
certains moments l'enfant choisit la suite avec la molette (« Léo entre-t-il dans la cabane ou
suit-il le chat ? »).

Le parcours suit six étapes, affichées en haut de chaque histoire :

| Étape | Ce qui se passe |
|-------|-----------------|
| **Idée** | Vous décrivez l'histoire souhaitée en quelques phrases : prénoms, âges, thème, lieu. Vous choisissez l'âge de l'enfant qui écoute et la taille de l'histoire. |
| **Scénarios** | Claude propose 4 scénarios différents. Vous en choisissez un, ou demandez 4 autres idées. |
| **Histoire** | Claude écrit toute l'histoire, avec ses embranchements. Vous pouvez tout relire, corriger une réplique, ou faire réécrire une étape avec une consigne. |
| **Voix** | Chaque personnage reçoit une voix (Voicebox, voix locale ou ElevenLabs), puis l'application fabrique tous les fichiers audio. |
| **Pictos** | Les petites images de l'écran de la Lunii : la couverture et une image par choix. |
| **Export** | L'application vérifie que tout est complet et produit un fichier `.zip` à installer sur la Lunii. |

Deux pages complètent ce parcours :

- **Famille** : l'apparence physique et la voix des vraies personnes de la famille, reprises
  automatiquement dans chaque nouvelle histoire ;
- **Ma Lunii** : la liste des histoires présentes sur la Lunii branchée, pour les ranger dans
  l'ordre de la molette ou en retirer.

## 2. Comment elle fonctionne

L'application tourne **entièrement sur votre ordinateur**. Elle se compose de deux programmes
lancés ensemble :

- le **serveur** (port 5174) : il garde les histoires, appelle les services d'IA, fabrique les
  fichiers audio et les packs ;
- l'**interface** (port 5173) : les pages que vous utilisez dans le navigateur.

```
 Navigateur  ──►  Interface (localhost:5173)  ──►  Serveur (127.0.0.1:5174)
                                                     │
                     ┌───────────────────────────────┼───────────────────────────────┐
                     ▼                               ▼                               ▼
              Écriture : Claude              Voix : Voicebox (local)          Images : Gemini
       (abonnement ou clé API)             ou voix locale Piper              (clé API, ou à la
                                           ou ElevenLabs (clé API)         main dans l'app Gemini)
                                                     │
                                                     ▼
                                     Dossier data/ : histoires, audios,
                                     images, réglages, fiche famille
```

Quelques points importants :

- **Rien n'est accessible depuis Internet** : le serveur n'écoute que l'ordinateur lui-même.
- **Les services d'IA ne sont appelés que quand vous cliquez** sur un bouton qui le demande
  (« Proposer 4 scénarios », « Générer les voix »…). Ceux qui sont payants le signalent.
- **Tout est enregistré dans le dossier `data/`** du projet. Une modification est enregistrée
  automatiquement quelques instants après la frappe.
- **Les sons sont traités localement** : l'application assemble les répliques, règle le volume
  et convertit les images au format de la Lunii (320 × 240 pixels) sans rien envoyer en ligne.

## 3. Ce qu'il faut avant de commencer

**Indispensable**

- Un ordinateur sous **Windows 10 ou 11** (l'application fonctionne aussi sur macOS et Linux, mais
  le lanceur en double-clic et ce guide visent Windows).
- **[Node.js](https://nodejs.org) version 24 ou plus récente** : le moteur qui fait tourner
  l'application. Prenez la version « LTS » et installez-la avec les options par défaut.
- Environ **2 Go d'espace libre** : l'application et ses outils prennent quelques centaines de
  Mo, chaque histoire avec ses audios quelques dizaines de Mo.
- **Un accès à Claude** pour écrire les histoires : un abonnement Claude Pro ou Max, ou une clé
  API Anthropic (voir [section 6](#6-écriture-des-histoires--claude)).

**Selon vos choix**

- **[Voicebox](https://voicebox.sh)** (gratuit) : pour des voix très naturelles, y compris des
  voix clonées à partir d'un enregistrement. Recommandé.
- **Un compte Google** pour les pictos dans l'app Gemini, ou une clé API Gemini.
- **Un compte ElevenLabs** et sa clé API, si vous voulez ses voix (payant).
- **Une Lunii** et un câble USB, ainsi que [STUdio](https://github.com/marian-m12l/studio) ou
  Lunii QT pour y installer les histoires.

## 4. Installation

### 4.1 Récupérer l'application

Vous avez reçu l'application sous forme d'un dossier (souvent une archive `.zip`). Décompressez-le
à un endroit simple, par exemple `C:\Users\<votre nom>\lunii-story-studio`.

Évitez un dossier synchronisé par OneDrive ou Google Drive : la synchronisation peut bloquer des
fichiers pendant que l'application les écrit.

### 4.2 Installer Node.js

1. Téléchargez la version LTS sur [nodejs.org](https://nodejs.org).
2. Lancez l'installateur et gardez les options par défaut.
3. Vérifiez l'installation : ouvrez **PowerShell** (menu Démarrer, tapez « PowerShell ») et tapez :

```bash
node --version
```

Le résultat doit commencer par `v24` ou plus.

### 4.3 Installer les dépendances

Dans PowerShell, placez-vous dans le dossier de l'application, puis installez ce dont elle a
besoin (cela télécharge environ 300 Mo et prend quelques minutes) :

```bash
cd $HOME\lunii-story-studio
```

```bash
npm.cmd install
```

> **Pourquoi `npm.cmd` et pas `npm` ?** Sous Windows, PowerShell refuse souvent de lancer `npm`
> avec le message « l'exécution de scripts est désactivée sur ce système ». Taper `npm.cmd`
> contourne ce blocage sans rien changer aux réglages de sécurité de Windows. Dans l'Invite de
> commandes (cmd) ou sur macOS, `npm` fonctionne directement.

### 4.4 Premier lancement

Double-cliquez sur **`Lancer Lunii Story Studio.cmd`** dans le dossier de l'application. Une
fenêtre noire s'ouvre, puis le navigateur affiche l'application à l'adresse
<http://localhost:5173>.

Pour le retrouver facilement : clic droit sur ce fichier, **Envoyer vers → Bureau (créer un
raccourci)**.

Cliquez ensuite sur **Premiers pas**, en haut de la page : elle vérifie ce qui est prêt et ce qui reste à régler, avec un lien vers chaque réglage. Les sections à suivre, dans l'ordre :

1. la [configuration de Claude](#6-écriture-des-histoires--claude) ;
2. l'[installation des voix](#7-les-voix) ;
3. si vous le souhaitez, la [fiche famille](#9-la-fiche-famille).

## 5. Lancer l'application chaque jour

- **Pour démarrer** : double-cliquez sur le lanceur (ou son raccourci). S'il tourne déjà, il
  ouvre seulement la page.
- **Pour arrêter** : fermez la fenêtre noire. Tant qu'elle est ouverte, l'application fonctionne.
- **Si vous utilisez Voicebox**, lancez-le aussi : il doit être ouvert pendant la génération des
  voix.

L'application s'arrête quand l'ordinateur s'éteint ou redémarre : il suffit de la relancer.

Sans le lanceur (macOS, Linux, ou pour voir les messages techniques) :

```bash
npm.cmd run app
```

## 6. Écriture des histoires : Claude

Les scénarios et les histoires sont écrits par Claude, l'IA d'Anthropic. Deux accès sont
possibles, à choisir dans **Réglages → Écriture des histoires**.

### Option A : votre abonnement Claude (par défaut)

Si vous avez un abonnement **Claude Pro ou Max**, l'application peut l'utiliser, sans frais en
plus. À faire une seule fois, dans PowerShell, dans le dossier de l'application :

```bash
npm.cmd run claude:login
```

Une page de connexion s'ouvre : connectez-vous avec votre compte Claude. Vérifiez ensuite dans
**Réglages → Vérifier la connexion**. Les histoires comptent dans les limites d'usage de votre
abonnement.

> **Important : usage personnel uniquement.** Les conditions d'Anthropic réservent ce mode à la
> personne titulaire de l'abonnement. Chaque personne qui installe l'application doit utiliser
> **son propre** abonnement, ou choisir l'option B. Ne partagez jamais votre connexion.

### Option B : une clé API Anthropic

1. Créez un compte sur la [console Anthropic](https://console.anthropic.com), ajoutez un moyen de
   paiement et créez une clé API.
2. Dans **Réglages**, collez-la dans « Anthropic (clé API) », cliquez sur **Enregistrer** puis
   **Tester**.
3. En haut des Réglages, choisissez « Une clé API Anthropic ».

L'usage est facturé par Anthropic, selon la longueur des histoires.

Le modèle utilisé se change dans **Réglages → Modèles** ; la valeur par défaut convient.

## 7. Les voix

Chaque personnage reçoit sa propre voix, et le narrateur aussi. Vous pouvez mélanger les sources
dans une même histoire.

| Source | Qualité | Prix | Ce qu'il faut |
|--------|---------|------|---------------|
| **Voicebox** | Très naturelle, voix clonées possibles | Gratuit | Installer Voicebox et créer des profils de voix |
| **Voix locale** (Piper) | Correcte, un peu robotique | Gratuit | Rien : la voix se télécharge en un clic |
| **ElevenLabs** | Très expressive | Payant | Une clé API ElevenLabs |

L'option « Ma voix » (s'enregistrer directement dans l'application) apparaît dans la liste mais
n'est pas encore disponible : pour utiliser une vraie voix, créez plutôt un profil Voicebox à
partir d'un enregistrement.

### 7.1 Voicebox (recommandé)

[Voicebox](https://voicebox.sh) est une application gratuite qui fabrique des voix sur votre
ordinateur, sans rien envoyer en ligne.

1. Téléchargez-le sur [voicebox.sh](https://voicebox.sh/download/windows), installez-le et
   lancez-le.
2. Créez un **profil de voix** par personnage. Trois façons :
   - **à partir d'un enregistrement** : quelques phrases lues par la vraie personne. C'est ce qui
     donne les voix les plus ressemblantes ;
   - à partir d'une voix prédéfinie ;
   - à partir d'une description (« mamie de 70 ans, voix douce et chaleureuse »).
3. Dans l'application, page **Voix**, choisissez « Voicebox » pour un personnage, puis son
   profil.

Voicebox doit rester ouvert pendant la génération des voix. L'application le cherche à l'adresse
`http://127.0.0.1:17493` (sa valeur par défaut).

> **Conseil pour les voix enregistrées.** Dans Voicebox, le texte associé à un enregistrement doit
> correspondre **exactement** à ce qui est dit dans l'audio. Si le texte contient une phrase de
> plus, des morceaux de cette phrase peuvent se glisser dans les répliques générées
> (par exemple une fin de phrase étrange au bout de chaque réplique). Utilisez la transcription
> de Voicebox, puis relisez-la.

### 7.2 Voix locale (Piper)

Rien à installer à l'avance. Page **Voix**, choisissez « Voix locale » puis une voix (Siwis,
Jessica, Pierre, Tom…) et cliquez sur **Télécharger cette voix**. La première fois,
l'application télécharge le moteur Piper (environ 22 Mo, depuis GitHub) puis la voix (environ
60 Mo, depuis Hugging Face). Ensuite tout fonctionne sans Internet.

### 7.3 ElevenLabs

Créez un compte sur [elevenlabs.io](https://elevenlabs.io), copiez votre clé API, et collez-la
dans **Réglages → ElevenLabs**. Ses voix apparaissent ensuite dans la page Voix. Chaque réplique
générée est facturée par ElevenLabs.

### 7.4 Générer et réécouter

Une fois chaque personnage associé à une voix, cliquez sur **Générer les voix**. Chaque réplique
peut ensuite être réécoutée et régénérée seule. Quand vous modifiez un texte, seule cette
réplique est marquée « à refaire ».

Si une réplique sonne mal (intonation bizarre, mot avalé), régénérez-la : chaque génération est
un peu différente.

## 8. Les pictos

Les pictos sont les images affichées sur l'écran de la Lunii : la **couverture** de l'histoire et
**une image par réponse** possible à chaque choix. Ils sont convertis automatiquement au format de
la Lunii.

Choisissez d'abord un **style** commun à toutes les images (aquarelle, dessin animé, pâte à
modeler, pixel art…). Les styles en couleur rendent mieux l'apparence des personnages : le pixel
art noir et blanc efface les couleurs de cheveux et les petits détails.

Ensuite, trois façons d'obtenir les images.

### 8.1 À la main dans l'app Gemini (inclus dans un compte Google)

C'est la méthode la plus économique.

1. Rechargez la page Pictos (touche **F5**) pour avoir les prompts à jour.
2. Ouvrez une **nouvelle conversation** sur [gemini.google.com](https://gemini.google.com).
3. Cliquez sur **Copier le message d'ouverture**, collez-le dans Gemini et envoyez-le. Il donne
   le style et l'apparence de tous les personnages.
4. Pour chaque picto : **Copier le prompt pour Gemini**, collez-le dans la même conversation,
   attendez l'image.
5. Dans Gemini, clic droit sur l'image → **Copier l'image**. Revenez dans l'application,
   sélectionnez le picto (il s'encadre) et faites **Ctrl + V**.

> Utilisez toujours une nouvelle conversation pour une nouvelle série : Gemini s'inspire des images
> déjà produites dans la conversation, et reprendrait d'anciennes apparences.

### 8.2 Automatiquement avec une clé API Gemini (payant)

Créez une clé sur [Google AI Studio](https://aistudio.google.com/apikey), activez la facturation
de votre projet Google, puis collez la clé dans **Réglages → Google Gemini**. Le bouton
**Générer avec la clé Gemini** de la page Pictos crée alors toutes les images d'un coup.

### 8.3 Vos propres images

Glissez n'importe quelle image (PNG ou JPEG) sur un picto, ou collez-la avec Ctrl + V : elle est
recadrée au bon format. Sans image, l'export crée un picto simple avec le titre.

Si vous changez ensuite l'histoire ou un personnage, les pictos concernés sont marqués « à
refaire ».

## 9. La fiche famille

La page **Famille** enregistre une fois pour toutes les **vraies personnes** de vos histoires :
enfants, parents, grands-parents, animaux.

Pour chacune :

- **Prénom** ;
- **Autres noms dans les histoires** : par exemple « Papa » pour le prénom du papa, ou « Mamie »
  et « Mamounette » pour une grand-mère. La reconnaissance ignore les majuscules, accents et tirets ;
- **Apparence physique** : cheveux, yeux, lunettes ou non, signes distinctifs. N'y mettez **pas**
  les vêtements ni les déguisements, qui changent d'une histoire à l'autre ;
- **Voix** : retenue automatiquement dès qu'elle est choisie à l'étape Voix.

Ce que la fiche apporte :

- quand Claude propose des scénarios, il connaît l'apparence de chacun et ne la contredit pas ;
- quand vous choisissez un scénario, chaque personne reconnue reprend son apparence et sa voix,
  sans rien ressaisir ;
- l'apparence est envoyée à Gemini pour dessiner les pictos.

Dans une histoire, l'étape **Histoire** montre pour chaque personnage deux champs : « Apparence
physique » (partagée avec la fiche famille) et « Tenue, déguisement et caractère » (propre à
cette histoire). Modifier l'apparence ou la voix dans une histoire met aussi la fiche à jour.

> **Astuce** : pour décrire quelqu'un fidèlement, partez d'une photo et notez ce qu'on voit
> vraiment (« cheveux bruns raides jusqu'au menton, avec une frange ») plutôt qu'une
> impression générale. Plus la description est précise, plus les pictos se ressemblent d'une
> image à l'autre.

## 10. Créer une histoire, étape par étape

1. **Mes histoires → Nouvelle histoire.**
2. **Idée** : décrivez l'histoire comme à un conteur, puis cliquez sur **Proposer 4
   scénarios**. Par exemple : « Une histoire d'Halloween
   pour Léo, 4 ans, avec sa petite sœur Mia et leur chat Moustache. Ils cherchent des citrouilles
   dans le jardin de leur grand-mère. Un peu de suspense, mais rien qui fasse vraiment peur. »
   - Réglez l'**âge de l'enfant qui écoute** : le vocabulaire et la longueur des phrases s'y
     adaptent, et l'âge apparaît dans le nom du fichier exporté.
   - Réglez la **taille** : nombre de choix sur un parcours, nombre de réponses par choix (2 ou
     3), durée d'un parcours. L'application affiche la durée totale qui en résulte.
3. **Scénarios** : lisez les 4 propositions et cliquez sur **Choisir ce scénario**. Sous « Aucun
   ne convient ? », **Autres propositions** en demande 4 nouvelles, avec une précision si vous
   voulez.
4. **Histoire** : cliquez sur **Écrire l'histoire** (une à deux minutes). L'arbre de l'histoire
   s'affiche ; cliquez sur une étape pour la lire et la corriger, ou sur **Régénérer cette
   étape** avec une consigne. Vérifiez aussi les
   personnages en bas de page.
5. **Voix** : associez une voix à chaque personnage, puis **Générer les voix**. Réécoutez.
6. **Pictos** : choisissez un style et créez les images (voir [section 8](#8-les-pictos)).
7. **Export** : la vérification liste ce qui manque. Quand tout est prêt, **Exporter le pack**,
   puis **Télécharger le pack**.

Tout est enregistré au fur et à mesure : vous pouvez fermer et reprendre plus tard.

## 11. Mettre l'histoire sur la Lunii

Le pack exporté est un fichier `.zip` au format **STUdio**, nommé avec l'âge entre crochets puis
le titre, par exemple `[4]la-fete-des-citrouilles-20261029-194900.zip`.

1. Ouvrez [STUdio](https://github.com/marian-m12l/studio) ou Lunii QT.
2. Importez le fichier `.zip` dans sa bibliothèque.
3. Branchez la Lunii en USB et transférez l'histoire.

## 12. Ma Lunii : ranger les histoires

La page **Ma Lunii** lit la Lunii branchée en USB (elle apparaît comme une clé) :

- **Ordre de la molette** : déplacez les histoires avec ↑ et ↓, puis **Enregistrer l'ordre** ;
- **Retirer** une histoire : elle est retirée de la Lunii et gardée dans une corbeille sur
  l'ordinateur, d'où elle peut être remise ;
- l'espace utilisé et libre est affiché.

Avant chaque modification, l'application sauvegarde la liste des histoires de la Lunii dans
`data/lunii/`. Elle ne touche jamais au contenu des histoires elles-mêmes.

> Fermez Lunii QT avant de modifier la Lunii ici : deux applications qui écrivent en même temps
> sur la Lunii peuvent abîmer sa liste d'histoires.

## 13. Vos données et la confidentialité

Tout ce que vous créez est dans le dossier **`data/`** de l'application :

| Élément | Emplacement |
|---------|-------------|
| Histoires, audios, images, exports | `data/projects/` |
| Réglages et clés API | `data/settings.json` |
| Fiche famille | `data/family.json` |
| Voix locales téléchargées | `data/piper/` |
| Sauvegardes de la Lunii et corbeille | `data/lunii/` |
| Histoires supprimées de l'application | `data/corbeille/` |

- **Pour sauvegarder votre travail**, copiez le dossier `data/` ailleurs (disque externe…).
- **Ce qui part en ligne** : le texte de vos indications et des personnages part chez Anthropic
  (Claude) pour écrire l'histoire ; les textes à dire partent chez ElevenLabs si vous l'utilisez ;
  les prompts des pictos partent chez Google si vous utilisez l'API Gemini. Avec Voicebox et Piper,
  les voix restent sur l'ordinateur.
- **Les clés API** ne sont jamais réaffichées après leur enregistrement.
- **Photos de la famille** : l'application n'en a pas besoin. Si vous vous en servez pour écrire
  les descriptions, elles ne sont pas stockées dans l'application.

## 14. Partager l'application

Pour donner l'application à quelqu'un, partagez le **code sans vos données** :

1. Faites une copie du dossier de l'application.
2. Dans la copie, **supprimez** :
   - `data/` (vos histoires, votre fiche famille, **vos clés API**) ;
   - `.env` s'il existe (il peut contenir des clés) ;
   - `node_modules/` et `dist/` (volumineux, ils se réinstallent avec `npm.cmd install`) ;
   - `tests/output/`.
3. Compressez la copie (clic droit → **Compresser dans un fichier ZIP**) et envoyez-la, avec ce
   guide.

Si le projet est sur GitHub ou un autre dépôt Git, ces dossiers sont déjà exclus (fichier
`.gitignore`) : il suffit de partager le lien du dépôt.

La personne qui reçoit l'application suit ce guide depuis la [section 4](#4-installation) et
configure **ses propres accès** : son abonnement Claude ou sa clé API, sa clé Gemini, ses voix
Voicebox. Vos voix clonées restent dans votre Voicebox et ne sont pas transmises.

## 15. Dépannage

| Problème | Solution |
|----------|----------|
| « Le serveur de l'application ne répond pas » | La fenêtre noire a été fermée ou l'ordinateur a redémarré : relancez avec le lanceur. |
| La page ne s'ouvre pas | Attendez quelques secondes et rechargez (F5). Si la fenêtre noire affiche une erreur `EADDRINUSE`, une ancienne copie tourne encore : fermez toutes les fenêtres noires et relancez. |
| PowerShell : « l'exécution de scripts est désactivée » | Tapez `npm.cmd` au lieu de `npm`. |
| La connexion Claude échoue | Relancez `npm.cmd run claude:login`, puis **Réglages → Vérifier la connexion**. Vérifiez aussi que vous n'avez pas atteint la limite d'usage de l'abonnement. |
| Les voix Voicebox ne s'affichent pas ou la génération échoue | Voicebox doit être ouvert. Dans la page Voix, cliquez sur **↻ Actualiser mes profils**. |
| Une réplique se termine par des mots en trop | Le texte associé à l'enregistrement dans Voicebox ne correspond pas exactement à l'audio : corrigez-le dans Voicebox (voir [7.1](#71-voicebox-recommandé)), puis régénérez. |
| Les pictos ne ressemblent pas aux personnages | Rechargez la page Pictos, ouvrez une nouvelle conversation Gemini, choisissez un style en couleur et vérifiez les descriptions dans la fiche famille. |
| L'export est refusé | La vérification liste ce qui manque (voix à générer, choix incomplet…) : chaque ligne mène à l'étape concernée. |
| La Lunii n'est pas détectée | Branchez-la, attendez qu'elle apparaisse comme lecteur dans l'Explorateur, puis **Actualiser**. |

## 16. Pour les développeurs

- **Technologies** : TypeScript, Node.js 24, serveur [Fastify](https://fastify.dev), interface
  React + [Vite](https://vite.dev), validation [Zod](https://zod.dev), images avec
  [sharp](https://sharp.pixelplumbing.com), audio avec ffmpeg (fourni par `ffmpeg-static`).
- **Organisation du code** :
  - `src/server/` : serveur (`ai/` Claude, `tts/` voix, `images/` pictos, `audio/` génération et
    assemblage, `pack/` export STUdio, `lunii/` gestion de la Lunii, `storage/` fichiers,
    `routes/` API) ;
  - `src/web/` : interface (une page par étape dans `pages/`) ;
  - `src/shared/` : modèle de données commun ;
  - `specs/` : spécification fonctionnelle détaillée ;
  - `tests/` : tests automatisés.
- **Commandes** :

| Commande | Rôle |
|----------|------|
| `npm.cmd run app` | Lance serveur et interface (ce que fait le lanceur) |
| `npm.cmd run dev` | Pareil, avec rechargement automatique du serveur à chaque modification du code (développement) |
| `npm.cmd test` | Lance les tests (sans clé ni réseau) |
| `npm.cmd run typecheck` | Vérifie les types TypeScript |
| `npm.cmd run build` puis `npm.cmd start` | Construit l'interface puis la sert depuis le seul serveur (port 5174) |

- **Variables d'environnement** (facultatives, dans un fichier `.env` copié depuis
  `.env.example`) : `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `PORT`
  (5174 par défaut), `DATA_DIR` (`./data` par défaut) et `VOICEBOX_URL`
  (`http://127.0.0.1:17493` par défaut).
