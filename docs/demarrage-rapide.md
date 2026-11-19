# Démarrage rapide : votre première histoire Lunii en 15 minutes

Lunii Story Studio crée des histoires interactives pour la Lunii : vous décrivez une idée,
Claude écrit l'histoire, l'application prépare les voix et les images, puis exporte un fichier à
mettre sur la Lunii. Tout tourne sur votre ordinateur (Windows).

Le [guide complet](guide.md) détaille chaque étape et contient un tableau de dépannage.

## Ce qu'il vous faut

- un ordinateur Windows ;
- un **abonnement Claude** (Pro ou Max) **à votre nom**, ou une clé API Anthropic ;
- [STUdio](https://github.com/marian-m12l/studio) ou Lunii QT pour transférer l'histoire sur la Lunii.

> L'abonnement Claude est réservé à un usage personnel : chacun utilise **son propre** compte.

## 1. Installer (une seule fois)

1. Installez [Node.js](https://nodejs.org) (version « LTS », options par défaut).
2. Ouvrez le dossier de l'application, cliquez dans la barre d'adresse de l'Explorateur, tapez
   `powershell` puis Entrée. Une fenêtre bleue s'ouvre dans le bon dossier.
3. Tapez ces deux commandes, l'une après l'autre :

   ```bash
   npm.cmd install
   ```

   ```bash
   npm.cmd run claude:login
   ```

   La seconde ouvre le navigateur : connectez-vous à **votre** compte Claude.
4. Clic droit sur **`Lancer Lunii Story Studio.cmd`** → **Envoyer vers → Bureau (créer un
   raccourci)**.

## 2. Lancer l'application

Double-cliquez sur le raccourci. Une fenêtre noire s'ouvre (gardez-la ouverte : la fermer arrête
l'application), puis le navigateur affiche l'application.

## 3. Vérifier que tout est prêt

Cliquez sur **Premiers pas** en haut de la page. Chaque étape y est marquée **Prêt**, **À faire**
ou **Facultatif**, avec un lien vers le bon réglage :

| Étape | Indispensable ? | Si ce n'est pas prêt |
|-------|-----------------|----------------------|
| Claude | oui | refaites `npm.cmd run claude:login`, ou mettez une clé API dans **Réglages** |
| Voix | conseillé | installez et ouvrez [Voicebox](https://voicebox.sh/download/windows) (gratuit), ou choisissez une voix locale dans l'étape Voix |
| Pictos | non | sans clé Gemini, l'application vous donne des consignes à coller dans l'app Gemini |
| Fiche famille | non | décrivez l'enfant et ses proches : ils gardent leur apparence et leur voix d'une histoire à l'autre |

## 4. Créer l'histoire

1. **Mes histoires → Nouvelle histoire** : décrivez l'idée (prénoms, âges, thème, ambiance) et
   l'âge de l'enfant, puis **Proposer 4 scénarios**.
2. **Choisir ce scénario** sur celui qui vous plaît, puis **Écrire l'histoire** (1 à 3 minutes).
3. Relisez et corrigez le texte, puis **Valider l'histoire et passer aux voix**.
4. **Voix** : choisissez une voix par personnage, puis générez les voix.
5. **Pictos** : générez ou importez les images, ou gardez celles par défaut.
6. **Export** : **Exporter le pack** produit un fichier `.zip`.

## 5. Mettre l'histoire sur la Lunii

Ouvrez STUdio (ou Lunii QT), branchez la Lunii, importez le fichier `.zip`, puis transférez-le.

## En cas de souci

- **La page reste sur « Chargement… »** : fermez la fenêtre noire et relancez le raccourci.
- **« Pas connecté à votre abonnement Claude »** : refaites `npm.cmd run claude:login`.
- **« Voicebox n'est pas lancé »** : ouvrez Voicebox, puis réessayez.
- Le reste : section « Dépannage » du [guide complet](guide.md).
