# Research: Créateur d'histoires interactives pour Lunii

**Date**: 2026-10-27 | **Plan**: [plan.md](plan.md)

## R1. Format du pack STUdio

- **Decision**: produire une archive `.zip` contenant `story.json`, `thumbnail.png` et un
  dossier `assets/` (fichiers nommés par leur empreinte SHA-1 + extension). `story.json` suit
  le schéma « format v1 » de STUdio : métadonnées (`title`, `description`, `format: "v1"`,
  `version`, `nightModeAvailable: false`), `stageNodes[]` et `actionNodes[]`. Détail et règles
  de correspondance avec notre modèle : [contracts/studio-pack.md](contracts/studio-pack.md).
- **Rationale**: c'est le format accepté à l'import par STUdio et Lunii QT. Le schéma a été
  vérifié dans les types de sérialisation de *studio-pack-generator* (générateur open source
  de référence) : `StageNode { uuid, type: "stage", name, squareOne, image, audio,
  okTransition, homeTransition, controlSettings { wheel, ok, home, pause, autoplay },
  position }` et `ActionNode { id, name, options: uuid[], position }`. La documentation STUdio
  rappelle la règle d'or : un nœud *stage* ne mène qu'à un nœud *action*, et un nœud *action*
  ne contient que des nœuds *stage*.
- **Alternatives considered**: écrire directement le format binaire de la Lunii (rejeté :
  dépend du firmware et du modèle, hors périmètre selon la spec) ; passer par
  studio-pack-generator en sous-processus (rejeté : il part d'une arborescence de dossiers,
  inadaptée aux branches qui se rejoignent, et ajoute une dépendance Deno).

## R2. Formats des médias

- **Decision**: audio **MP3 mono 44 100 Hz** (libmp3lame), normalisé en crête à 0 dB ; images
  **PNG 320×240**. Couverture du pack (`thumbnail.png`) en 320×240 également.
- **Rationale**: formats acceptés par STUdio (PNG/JPEG/BMP 320×240 ; MP3/OGG 44,1 kHz) ;
  studio-pack-generator vérifie exactement « mp3, 44100 Hz, mono » et « 320x240 ». La
  documentation STUdio recommande la normalisation de crête à 0 dB pour un bon rendu.
- **Alternatives considered**: OGG (moins répandu, aucun gain) ; WAV 32 kHz (fichiers lourds).

## R3. Pile technique

- **Decision**: **TypeScript** de bout en bout sur **Node.js 24** (déjà installé). Serveur
  **Fastify** ; interface **React + Vite** ; validation des données avec **Zod** (schémas
  partagés serveur/interface) ; tests **Vitest**.
- **Rationale**: un seul langage pour tout le projet (principe V) ; Zod sert à la fois à
  valider les réponses de l'IA, les requêtes HTTP et la structure du pack ; Fastify est léger
  et sait servir les fichiers statiques de l'interface.
- **Alternatives considered**: Python/FastAPI + React (deux langages) ; Next.js (plus lourd
  que nécessaire pour une app locale mono-utilisateur) ; Electron (spec : application web).

## R4. Stockage

- **Decision**: fichiers locaux dans un dossier de données (`data/` par défaut, configurable) :
  un dossier par projet contenant `project.json` (tout le modèle) et les sous-dossiers
  `audio/`, `images/`, `exports/`. Écriture atomique (fichier temporaire puis renommage).
- **Rationale**: aucune base à installer (principe V), sauvegarde/copie triviale, données
  visibles par l'utilisateur (principe III). Le volume (quelques dizaines de projets) ne
  justifie pas de base de données.
- **Alternatives considered**: SQLite (inutile à cette échelle) ; stockage navigateur
  IndexedDB (fragile, données perdues si le navigateur est nettoyé).

## R5. Génération de texte (Claude)

- **Decision**: SDK officiel `@anthropic-ai/sdk`, modèle **`claude-opus-5-5`** par défaut
  (réglable, ex. `claude-sonnet-5-5` pour un coût divisé par deux). Réponses structurées via
  les *structured outputs* (`client.beta.messages.parse` + `betaZodOutputFormat`), validées par
  Zod ; le « tool use forcé » n'est pas utilisé (refusé par Opus 5.5 et Sonnet 5.5). Repli
  serveur en cas de refus de sécurité (`fallbacks: "default"`). En cas de réponse invalide ou
  incohérente, une seule nouvelle tentative avec les problèmes renvoyés au modèle. Un prompt système commun impose les règles de sécurité
  enfant (principe I), la langue française, l'âge de l'auditeur et les réglages de taille
  (FR-029).
- **Rationale**: le schéma imposé garantit un arbre exploitable (FR-005) ; Opus 5.5 est le
  modèle recommandé par défaut pour la qualité d'écriture, Sonnet 5.5 reste un choix moins cher.
- **Alternatives considered**: texte libre puis analyse (fragile) ; génération étape par étape
  sans vue d'ensemble (incohérences narratives).
- **Stratégie de génération**: (1) 4 scénarios en un seul appel ; (2) le *squelette* de
  l'arbre (étapes, choix, fins, résumés) en un appel, validé structurellement en code ;
  (3) le texte détaillé des étapes, par lots, avec le squelette en contexte. La régénération
  d'une étape (FR-007) réutilise l'étape (3) pour un seul nœud.

- **Accès à Claude** (ajout du 2026-10-28, à la demande du propriétaire) : par défaut, l'application
  passe par l'**abonnement Claude** de l'utilisateur grâce au SDK Claude Agent
  (`@anthropic-ai/claude-agent-sdk`, `query()` avec `outputFormat` JSON Schema, sans outil ni
  réglage du poste, environnement nettoyé de toute clé API). Connexion unique avec
  `npm run claude:login`. La documentation d'Anthropic interdit d'offrir la connexion claude.ai
  dans une application proposée à d'autres : ce mode est donc limité à un usage personnel, et
  l'accès par clé API reste disponible dans les Réglages pour le jour où l'application est
  partagée. Les deux accès implémentent la même interface `TextGenerator`.

## R6. Voix de synthèse

- **Decision**: interface commune `TtsProvider` avec deux implémentations :
  - **ElevenLabs** (API HTTP, modèle multilingue, sortie MP3) ;
  - **Piper** (TTS local, hors ligne, voix françaises ONNX), exécutable et voix téléchargés
    à la demande par l'app dans le dossier de données, à la première utilisation.
- **Rationale**: Piper est gratuit, rapide sur CPU et de bonne qualité en français, ce qui
  satisfait l'alternative locale exigée (principe III) ; ElevenLabs couvre le besoin de voix
  expressives par personnage.
- **Alternatives considered**: voix Windows SAPI (qualité faible, non portable) ; Coqui XTTS
  (lourd, nécessite Python et idéalement un GPU).

- **Voix HD locales via Voicebox** (ajout du 2026-10-28, à la demande du propriétaire) : source de
  voix « voicebox » qui appelle l'API locale de [Voicebox](https://github.com/jamiepine/voicebox)
  (MIT, `http://127.0.0.1:17493`) : `GET /profiles`, `POST /generate` (`profile_id`, `text`,
  `language: "fr"`), suivi `GET /generate/{id}/status` (flux SSE), puis `GET /audio/{id}`. Chaque
  personnage utilise un **profil de voix** Voicebox (cloné d'un enregistrement, prédéfini ou créé
  par description avec Qwen VoiceDesign), réutilisable d'une histoire à l'autre pour les
  personnages récurrents. Voicebox s'installe et se lance à part (moteurs Qwen3-TTS, Chatterbox,
  etc., sur la carte graphique). Choisi plutôt qu'une installation Python maison de Qwen3-TTS :
  profils gérés dans un vrai studio, moins de code à maintenir. Piper et ElevenLabs restent
  disponibles.

## R7. Enregistrement dans le navigateur

- **Decision**: API `MediaRecorder` du navigateur (`getUserMedia`), envoi du fichier brut
  (WebM/Opus) au serveur, conversion par ffmpeg au format cible (R2). Indicateur de niveau
  en direct, et détection silence/saturation avant validation de la prise.
- **Rationale**: natif dans Chrome/Edge/Firefox ; `localhost` est un contexte sécurisé, donc
  l'accès au micro est autorisé sans HTTPS.

## R8. Traitement audio et assemblage

- **Decision**: **ffmpeg** fourni par le paquet npm `ffmpeg-static` (aucune installation
  manuelle, ffmpeg absent du poste). Chaque réplique est convertie (R2), puis l'audio d'une
  étape est la concaténation ordonnée de ses répliques avec un court silence entre elles,
  puis normalisée.
- **Rationale**: ffmpeg couvre conversion, concaténation, normalisation et analyse de niveau.

## R9. Pictos (génération d'images)

- **Decision** (révisée le 2026-10-28 à la demande du propriétaire du projet) : **Nano Banana
  de Google Gemini**, modèle `gemini-nano-banana-2.1` par défaut (réglable, ex.
  `gemini-3-pro-image` pour la version Pro ou `gemini-3.1-flash-lite-image` pour la moins
  chère), via le SDK `@google/genai` (`ai.interactions.create`, `response_format` de type
  image avec `aspect_ratio: "4:3"` et `image_size: "1K"`, image renvoyée en base64), clé
  `GEMINI_API_KEY` (en-tête `x-goog-api-key`). Le tout derrière une interface
  `ImageProvider` pour pouvoir changer de fournisseur. Prompt construit à partir du **style
  commun** choisi (4 à 6 styles prédéfinis : aquarelle douce, papier découpé, dessin animé,
  crayons de couleur…), de la description visuelle des personnages (gardée constante pour
  la cohérence) et de l'objet de l'option. Contraintes ajoutées : sujet unique centré, fort
  contraste, pas de texte, lisible en petit. Recadrage et redimensionnement en 320×240 avec
  **sharp**. Pictos par défaut (FR-018) : libellé de l'option sur un fond coloré, générés
  localement avec sharp.
- **Implémentation** (2026-10-28) : appel REST direct `models/{modèle}:generateContent`
  (`responseModalities: ["IMAGE"]`, `imageConfig.aspectRatio: "4:3"`) plutôt que le SDK,
  pour ne pas ajouter de dépendance ; la couverture générée est passée en image de référence
  aux pictos des options. Style par défaut demandé par le propriétaire : **pixel art rétro**
  monochrome (blanc et gris sur fond noir, cadre arrondi en pixels).
- **Rationale**: Nano Banana excelle à garder des personnages et un style cohérents d'une
  image à l'autre, ce qui compte pour une série de pictos d'une même histoire ; la
  génération locale (Stable Diffusion) exige un GPU et une installation lourde (contraire au
  principe V). À vérifier lors de l'implémentation : les formats acceptés par le modèle
  retenu (4:3 est confirmé par la documentation au moins pour Flash Lite) et l'API exacte
  du SDK, qui a évolué plusieurs fois.
- **Alternatives considered**: API d'images OpenAI (`gpt-image-1`, choix initial, remplacé) ;
  Stable Diffusion/ComfyUI local ; Flux via fal.ai/Replicate (possibles plus tard grâce à
  l'interface `ImageProvider`).

## R10. Archive ZIP

- **Decision**: bibliothèque `yazl` (écriture ZIP en flux) ; lecture `yauzl` dans les tests
  pour vérifier les packs générés.
- **Rationale**: simple, sans dépendance native, adaptée aux fichiers volumineux.

## R11. Secrets

- **Decision**: clés stockées dans `data/settings.json` côté serveur (ce dossier est exclu de
  git) ou dans des variables d'environnement `.env` ; l'API ne renvoie jamais une clé, seulement
  son état (`configurée`, et ses 4 derniers caractères) ; le serveur n'écoute que sur
  `127.0.0.1`.
- **Rationale**: principe III ; un parent non technicien saisit ses clés dans l'écran de
  réglages plutôt que d'éditer un fichier.

## R12. Validation de compatibilité

- **Decision**: un validateur interne de pack (structure + médias) exécuté avant chaque export
  et dans les tests ; un **pack de référence** généré par les tests avec des médias factices.
  Un test d'import manuel dans STUdio est requis avant de déclarer la fonctionnalité terminée
  (voir [quickstart.md](quickstart.md)).
- **Rationale**: principe VI. Un contrôle automatisé dans STUdio lui-même (application Java)
  est hors de portée des tests unitaires ; le validateur reproduit ses règles connues.
