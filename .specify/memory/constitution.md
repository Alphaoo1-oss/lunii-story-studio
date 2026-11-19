# Lunii Story Studio Constitution

## Core Principles

### I. Contenu adapté aux enfants (NON NÉGOCIABLE)

- Tout contenu généré (scénarios, histoires, répliques, pictos) MUST être adapté à l'âge indiqué
  pour l'enfant auditeur : pas de violence graphique, de contenu sexuel, de propos haineux,
  de langage grossier, ni d'incitation à des comportements dangereux.
- Les thèmes « qui font peur » (ex. Halloween) MUST rester ludiques et se terminer de façon
  rassurante.
- Les consignes de sécurité MUST être intégrées aux instructions envoyées aux modèles d'IA
  (texte et images), et non laissées à la seule bonne volonté du fournisseur.
- Un contenu MUST NOT être exporté sans avoir été présenté à l'utilisateur (voir IV).

Justification : le public final est un jeune enfant qui écoute seul ; l'adulte doit pouvoir
faire confiance à l'outil par défaut.

### II. Compatibilité stricte du pack STUdio (NON NÉGOCIABLE)

- Le pack exporté MUST respecter le format de pack STUdio (archive .zip contenant
  `story.json` et le dossier `assets/`) et MUST pouvoir être importé sans erreur ni
  retouche manuelle dans STUdio et dans les outils compatibles (ex. Lunii QT).
- Les médias MUST être convertis aux formats acceptés : audio MP3 (ou OGG) et images au
  format et à la résolution de l'écran Lunii (320×240).
- La structure interactive MUST être valide : chaque nœud est atteignable, chaque choix mène
  à un nœud existant, et chaque branche se termine (fin d'histoire ou retour au menu).
- Un export invalide MUST être bloqué avec un message expliquant quoi corriger ; un pack partiel
  ou corrompu MUST NOT être produit.

Justification : un pack refusé par la Lunii rend tout le travail créatif inutile.

### III. Local d'abord, secrets protégés

- L'application MUST tourner sur le poste de l'utilisateur et n'écouter que sur `localhost`.
- Les histoires, enregistrements, images et packs MUST être stockés localement ; seules les
  données nécessaires à une génération sont envoyées aux services externes choisis
  (Anthropic, ElevenLabs, fournisseur d'images).
- Les clés API MUST être stockées localement (ex. fichier `.env` ou réglages locaux) et MUST NOT
  être versionnées, journalisées, ni renvoyées en clair au navigateur.
- Chaque fonctionnalité dépendant d'un service externe MUST indiquer clairement quand elle
  l'appelle ; une alternative locale (ex. enregistrement de sa propre voix, TTS local) SHOULD
  exister quand c'est raisonnable.

Justification : il s'agit de contenus familiaux (prénoms, voix des proches) et de clés payantes.

### IV. L'utilisateur garde la main

- Chaque étape MUST être validée explicitement par l'utilisateur avant la suivante :
  saisie des indications → choix parmi 4 scénarios → relecture/modification de l'histoire →
  choix des voix (enregistrées ou générées) → pictos → export.
- Tout contenu généré MUST être modifiable ou régénérable individuellement (une réplique, une
  voix, un picto) sans tout refaire.
- Le travail en cours MUST être sauvegardé automatiquement et pouvoir être repris.

Justification : l'IA propose, l'adulte décide ; et une génération ratée ne doit pas faire
perdre le reste.

### V. Simplicité

- Application mono-utilisateur : pas de comptes, pas d'authentification, pas de base de données
  serveur tant qu'un besoin réel ne l'impose pas.
- Le nombre de dépendances et de services MUST rester minimal ; toute complexité ajoutée
  (nouveau service, nouvelle couche) MUST être justifiée dans le plan.
- L'interface MUST être utilisable par un parent non technicien, en peu d'étapes claires.

Justification : un outil familial personnel doit rester facile à maintenir et à utiliser.

### VI. Tests du pack et de la génération

- La génération du pack STUdio et sa validation (structure, références de médias, formats)
  MUST être couvertes par des tests automatisés, écrits avant ou avec le code concerné.
- Les tests MUST pouvoir tourner sans clé API ni réseau : les appels aux services d'IA sont
  simulés (doublures/fixtures).
- Au moins un pack d'exemple de référence MUST être généré par les tests et vérifié.

Justification : la compatibilité du pack (principe II) est le risque principal du projet.

## Contraintes produit et techniques

- Interface utilisateur et contenus générés en **français**.
- Application web locale : serveur local + interface dans le navigateur.
- Génération de texte : API Anthropic (Claude). Voix : enregistrement dans le navigateur,
  TTS local ou ElevenLabs. Pictos : service de génération d'images choisi au moment du plan.
- Les appels payants SHOULD être évitables à chaque étape et leur déclenchement MUST être une
  action explicite de l'utilisateur (pas de génération en masse non demandée).
- Les erreurs des services externes (quota, clé invalide, réseau) MUST être affichées
  clairement en français, sans perte du travail en cours.

## Flux de développement et qualité

- Chaque fonctionnalité suit le flux Spec Kit : spécification → (clarification) → plan →
  tâches → implémentation, sur une branche dédiée.
- Le plan MUST contenir une vérification de conformité à cette constitution ; tout écart MUST
  être justifié dans la section de suivi de complexité.
- Une fonctionnalité n'est terminée que si : les tests passent, un pack exporté a été validé,
  et aucun secret n'apparaît dans le dépôt.

## Governance

- Cette constitution prévaut sur toute autre pratique du projet.
- Toute modification MUST être documentée (rapport d'impact en tête de fichier), versionnée et
  validée par le propriétaire du projet.
- Versionnage sémantique : MAJOR pour la suppression ou redéfinition d'un principe, MINOR pour
  l'ajout d'un principe ou d'une section, PATCH pour les clarifications.
- Chaque plan et chaque revue MUST vérifier la conformité aux principes I à VI.

**Version**: 1.0.0 | **Ratified**: 2026-10-27 | **Last Amended**: 2026-10-27
