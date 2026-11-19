---

description: "Task list for Lunii Story Studio — créateur d'histoires interactives"
---

# Tasks: Créateur d'histoires interactives pour Lunii

**Input**: Design documents from `/specs/001-lunii-story-creator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: inclus. La constitution (principe VI) impose des tests automatisés du pack et de la
génération, sans clé API ni réseau. Les tests de chaque phase sont écrits AVANT le code et
doivent échouer d'abord.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Projet unique (voir plan.md) : `src/shared/`, `src/server/`, `src/web/`, `tests/` à la racine.
Interface et messages en français. Toutes les API externes sont appelées via des interfaces
injectables, remplacées par des doublures dans les tests.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create `package.json` (type module, Node ≥ 24) with scripts `dev` (serveur + Vite en parallèle), `build`, `start`, `test` (vitest run), `typecheck`, and install dependencies: fastify, @fastify/static, @fastify/multipart, zod, @anthropic-ai/sdk, ffmpeg-static, sharp, yazl, yauzl, react, react-dom; dev: typescript, vite, @vitejs/plugin-react, vitest, tsx, concurrently, @types/* in `package.json`
- [X] T002 [P] Create `tsconfig.json` (strict, ES2023, moduleResolution bundler, paths `@shared/*` → `src/shared/*`) and `vite.config.ts` (root `src/web`, proxy `/api` et `/media` vers le serveur, build vers `dist/web`) in `tsconfig.json` and `vite.config.ts`
- [X] T003 [P] Create `vitest.config.ts` (environnement node, `tests/**/*.test.ts`, alias `@shared`) in `vitest.config.ts`
- [X] T004 [P] Create `.env.example` listing `ANTHROPIC_API_KEY=`, `ELEVENLABS_API_KEY=`, `GEMINI_API_KEY=`, `PORT=5174`, `DATA_DIR=./data` with no values, and a French `README.md` (installation, lancement, où mettre les clés) in `.env.example` and `README.md`
- [X] T005 [P] Create the directory skeleton from plan.md with placeholder `index.ts` files: `src/shared/`, `src/server/{routes,storage,story,ai,tts,images,audio,pack}/`, `src/web/{pages,components,api}/`, `tests/{fixtures,pack,graph,ai,audio,api}/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Define all Zod schemas and inferred types from data-model.md in `src/shared/model.ts`: `Project` (title "1–80 car.", description "0–300 car.", brief "1–4000 car.", listenerAge "2–10 ans", stage enum `brief | scenarios | story | voices | pictos | export`), `SizeSettings` (choicesPerPath "1–4" défaut 2, optionsPerChoice "2 ou 3" défaut 2, allowMerging défaut true, minutesPerPath "5–20" défaut 10), `Scenario`, `Character` (name unique, "exactement un narrateur par projet"), `VoiceAssignment` (source `recorded | piper | elevenlabs`, voiceId "requis pour piper et elevenlabs"), `StoryGraph`, `Segment` (lines "≥ 1", next `{kind:"choice",choiceId} | {kind:"segment",segmentId} | {kind:"end"}`), `Line` (text "1–1000 car.", textHash), `Choice` (options "2 ou 3"), `ChoiceOption` (label "1–60 car."), `AudioClip` (source `recorded | piper | elevenlabs | assembled`), `Picto` (origin `generated | imported | default`), `ExportRecord`, `Settings`
- [X] T007 [P] Define API request/response schemas and the error shape `{ error: { code, message } }` from contracts/http-api.md, plus the export error item `{ code, message, target: { kind, id } }` in `src/shared/api.ts`
- [X] T008 Implement atomic JSON file storage (write to temp file then rename), project folder layout `data/projects/<id>/{project.json,audio/,images/,exports/}`, load/save/list/delete with Zod validation on read in `src/server/storage/projects.ts`
- [X] T009 [P] Implement settings storage in `data/settings.json` merged with `.env` variables; expose `getSettings()` (full, server only) and `getPublicSettings()` returning each key as `{ configured: bool, last4: string }` only, never the value (principe III) in `src/server/storage/settings.ts`
- [X] T010 [P] Implement ffmpeg helpers using `ffmpeg-static`: `probe(file)` (codec, sample rate, channels, duration), `toLuniiMp3(input, output)` (MP3 mono 44 100 Hz libmp3lame, normalisation crête 0 dB), `concat(files, gapMs, output)` and `levels(file)` (peakDb, silent, clipped) in `src/server/audio/ffmpeg.ts`
- [X] T011 [P] Implement image helpers with sharp: `toLuniiPng(input, output)` (recadrage centré 4:3 puis 320×240 PNG) and `defaultPicto(label, color, output)` (texte du libellé centré sur fond coloré, 320×240) in `src/server/images/convert.ts`
- [X] T012 Create Fastify server bound to `127.0.0.1` only (port from settings, défaut 5174), JSON error handler mapping Zod and service errors to French messages, `/media/:projectId/*` read-only static route, and static serving of `dist/web` in production in `src/server/index.ts`
- [X] T013 Implement settings routes `GET /api/settings`, `PUT /api/settings`, `POST /api/settings/test/:service` (anthropic, elevenlabs, gemini; chaque test passe par l'interface du service concerné) in `src/server/routes/settings.ts`
- [X] T014 [P] Create the web app shell: router, French layout, stepper showing project stage (brief → scénarios → histoire → voix → pictos → export), typed API client with French error display in `src/web/main.tsx`, `src/web/App.tsx` and `src/web/lib/client.ts`
- [X] T015 [P] Create the Settings page (saisie des 3 clés masquées, bouton « Tester » par service, choix des modèles texte `claude-opus-5-5` par défaut et image `gemini-nano-banana-2.1` par défaut) in `src/web/pages/Settings.tsx`
- [X] T016 [P] Write tests for atomic storage (round-trip, interrupted write leaves previous file intact) and for `getPublicSettings` never exposing a key in `tests/api/storage.test.ts`
- [X] T017 [P] Write tests for ffmpeg helpers on short generated tones (sortie MP3 mono 44 100 Hz vérifiée par `probe`, concat dans l'ordre, détection silence/saturation) in `tests/audio/ffmpeg.test.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 2 - Export d'un pack STUdio jouable sur la Lunii (Priority: P1) 🎯 MVP (risque principal)

**Goal**: à partir d'un projet complet, produire un pack STUdio valide ; bloquer l'export et
désigner les manques sinon. Réalisé en premier côté serveur (plan.md, phasage), avec une
histoire et des médias de référence, pour lever tôt le risque de compatibilité.

**Independent Test**: `npm test` génère le pack de référence et le vérifie ; importer
`tests/output/reference-pack.zip` dans STUdio sans erreur (quickstart V9, V10).

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T018 [P] [US2] Create the reference fixture: a project with 1 intro, 2 choices × 2 options, branches qui se rejoignent, 2 fins, plus a script generating tiny test MP3s and PNGs into a temp dir in `tests/fixtures/reference-story.json` and `tests/fixtures/media.ts`
- [X] T019 [P] [US2] Write graph validity tests for the 6 rules of data-model.md (départ existant, une seule suite par segment, cibles existantes, tout atteignable, aucun cycle, respect de `choicesPerPath` et `optionsPerChoice`) with one failing case per rule in `tests/graph/validate.test.ts`
- [X] T020 [P] [US2] Write mapping tests checking contracts/studio-pack.md: exactly one `squareOne`, node kinds `cover` / `seg-` / `opt-` with the exact `controlSettings` of the table, `okTransition` targets and `optionIndex` in bounds, endings with `okTransition: null`, `homeTransition: null`, merged branches sharing nodes, and `"format": "v1"`, `"nightModeAvailable": false` in `tests/pack/mapping.test.ts`
- [X] T021 [P] [US2] Write archive tests: export the reference project, reopen the zip with yauzl, assert exact content (`story.json`, `thumbnail.png`, `assets/<sha1>.mp3|png` only), every referenced asset present, deduplication by SHA-1, real format checks (MP3 mono 44 100 Hz via probe, PNG 320×240 via sharp), and no partial file left when export fails in `tests/pack/archive.test.ts`
- [X] T022 [P] [US2] Write pre-export check tests: segment sans audio, option sans annonce, audio obsolète, graphe invalide → list of `{ code, message (fr), target }`; option sans picto → picto par défaut créé automatiquement (FR-018) in `tests/pack/check.test.ts`

### Implementation for User Story 2

- [X] T023 [US2] Implement graph validation (6 rules) returning French errors with targets, plus derived states (segment atteignable, isEnding) in `src/server/story/validate.ts`
- [X] T024 [US2] Implement line/segment audio state derivation `missing | stale | ok` (textHash ≠ hash du texte actuel, ou voix du personnage changée) in `src/server/story/state.ts`
- [X] T025 [US2] Implement model → StoryPack mapping per contracts/studio-pack.md (StageNode/ActionNode with uuid v4, action nodes `start`, `choice-`, `next-`, `go-`, layered `position` profondeur × rang) in `src/server/pack/mapping.ts`
- [X] T026 [US2] Implement asset collection: copy media under SHA-1 names, deduplicate, verify formats with `probe` and sharp, generate missing default pictos with `defaultPicto`, build `thumbnail.png` from the cover in `src/server/pack/assets.ts`
- [X] T027 [US2] Implement pre-export check combining graph validity, audio states and asset checks (FR-019) in `src/server/pack/check.ts`
- [X] T028 [US2] Implement zip writer with yazl: write to `exports/<titre>-<date>.zip.tmp` then rename; on any error delete the temp file; record `ExportRecord` with stats `{segments, choices, endings, totalMinutes}` in `src/server/pack/export.ts`
- [X] T029 [US2] Implement export routes `GET /api/projects/:id/export/check`, `POST /api/projects/:id/export` (422 with errors if invalid), `GET /api/projects/:id/exports/:file` in `src/server/routes/export.ts`
- [X] T030 [US2] Create the Export page: liste des manques cliquable vers l'élément fautif, bouton « Exporter », récapitulatif (segments, choix, fins, durée), téléchargement du .zip, rappel de la procédure d'import dans STUdio / Lunii QT in `src/web/pages/Export.tsx`
- [X] T031 [US2] Add a test script writing the reference pack to `tests/output/reference-pack.zip` (ignored by git) for manual import in STUdio, in `tests/pack/reference-pack.test.ts`

**Checkpoint**: le pack de référence est généré, validé par les tests et importable dans STUdio

---

## Phase 4: User Story 1 - De l'idée à l'histoire interactive écrite (Priority: P1) 🎯 MVP

**Goal**: indications libres → 4 scénarios → histoire interactive complète, réglable en taille,
éditable et régénérable par segment.

**Independent Test**: quickstart V1–V4 ; les tests `tests/ai/` passent avec des réponses
enregistrées, sans clé.

### Tests for User Story 1 ⚠️

- [X] T032 [P] [US1] Record fake Claude responses (4 scénarios valides ; squelette valide ; squelette avec cible inexistante ; JSON tronqué ; segment régénéré) in `tests/fixtures/ai/`
- [X] T033 [P] [US1] Write size estimate tests: sans rejonction `fins = optionsPerChoice ^ choicesPerPath`, avec rejonction segments ≈ `1 + choicesPerPath × optionsPerChoice`, avertissement au-delà de 40 segments ou de 60 minutes totales in `tests/graph/estimate.test.ts`
- [X] T034 [P] [US1] Write AI service tests with a fake client: exactly 4 distinct scenarios parsed; invalid response triggers one retry with the validation error; skeleton violating size settings is rejected; system prompt contains child-safety rules, French language and listener age; regenerating one segment leaves all others unchanged in `tests/ai/story-service.test.ts`
- [X] T035 [P] [US1] Write route tests with Fastify inject for scenarios, select, story generation, segment/option PATCH and regenerate (doublure IA) in `tests/api/story-routes.test.ts`

### Implementation for User Story 1

- [X] T036 [US1] Implement size estimate and warnings (FR-029) in `src/shared/estimate.ts` (shared so the UI recomputes it live)
- [X] T037 [US1] Implement the Claude client wrapper behind a `TextGenerator` interface (modèle depuis les réglages, sortie structurée par outil à schéma JSON imposé, une nouvelle tentative avec l'erreur Zod, erreurs traduites en français : clé invalide, quota, réseau) in `src/server/ai/claude.ts`
- [X] T038 [US1] Write prompts: shared system prompt (règles de sécurité enfant du principe I, thèmes effrayants ludiques avec fin rassurante, français, âge de l'auditeur), scenarios prompt (4 intrigues distinctes reprenant prénoms, âges, thème, précision facultative), skeleton prompt (respect de SizeSettings, question en dernière réplique avant un choix), segment prompt (texte détaillé, durée visée par parcours) in `src/server/ai/prompts.ts`
- [X] T039 [US1] Implement the story service: `proposeScenarios(project, extraHint?)`, `selectScenario` (crée les personnages + le narrateur), `generateStory` (squelette validé par `validate.ts` puis texte des segments par lots), `regenerateSegment(segmentId, instruction?)`; ambiguous briefs return the assumptions made (prénoms, âge) in `src/server/ai/story-service.ts`
- [X] T040 [US1] Implement project and story routes from contracts/http-api.md (`/api/projects` CRUD minimal: create/get/patch, `/scenarios`, `/scenarios/:scenarioId/select`, `/story`, `PATCH /segments/:segmentId`, `PATCH /options/:optionId`, `/segments/:segmentId/regenerate`, `PATCH /characters/:characterId`); every edit re-runs graph validation and returns derived states in `src/server/routes/projects.ts` and `src/server/routes/story.ts`
- [X] T041 [P] [US1] Create the Brief page: champ libre, âge de l'auditeur, bouton « Proposer 4 scénarios » marqué comme appel payant in `src/web/pages/Brief.tsx`
- [X] T042 [P] [US1] Create the Scenarios page: 4 cartes (titre, résumé, personnages, idées de choix), « Choisir », « Autres propositions » avec précision facultative, historique des lots in `src/web/pages/Scenarios.tsx`
- [X] T043 [P] [US1] Create the size settings panel with live estimate and warnings (sliders 1–4 choix, 2/3 options, rejonction, 5–20 min) in `src/web/components/SizeSettings.tsx`
- [X] T044 [US1] Create the story tree component (segments, choix, options, fins ; segments invalides ou inatteignables mis en évidence) in `src/web/components/StoryTree.tsx`
- [X] T045 [US1] Create the Story page: arbre + éditeur du segment sélectionné (répliques avec personnage, libellés d'options), « Régénérer ce segment » avec consigne facultative, confirmation si changement de scénario remplace le graphe, autosave in `src/web/pages/Story.tsx`

**Checkpoint**: US1 + US2 forment le MVP (histoire écrite et pack exportable avec médias de test)

---

## Phase 5: User Story 3 - Voix générées automatiquement (Priority: P2)

**Goal**: attribuer une voix de synthèse (Piper local ou ElevenLabs) à chaque personnage,
écouter un aperçu, générer et régénérer les audios.

**Independent Test**: quickstart V5 (partie synthèse) et V12 ; tests `tests/audio/` avec
doublures TTS.

### Tests for User Story 3 ⚠️

- [X] T046 [P] [US3] Write TTS orchestration tests with a fake `TtsProvider`: génère uniquement les répliques `missing` ou `stale`, conserve les audios déjà produits si un appel échoue, régénération d'une seule réplique, textHash mis à jour in `tests/audio/tts-generate.test.ts`
- [X] T047 [P] [US3] Write assembly tests: l'audio d'un segment enchaîne les répliques dans l'ordre du texte quelle que soit la source, annonce d'option produite par la voix du narrateur in `tests/audio/assemble.test.ts`

### Implementation for User Story 3

- [X] T048 [P] [US3] Define the `TtsProvider` interface (`listVoices()`, `synthesize(text, voiceId, settings) → fichier audio`) in `src/server/tts/provider.ts`
- [X] T049 [P] [US3] Implement the ElevenLabs provider (liste des voix, synthèse MP3 multilingue, erreurs traduites : clé, quota, réseau) in `src/server/tts/elevenlabs.ts`
- [X] T050 [P] [US3] Implement the Piper provider: téléchargement à la demande du binaire et d'au moins 2 voix françaises dans `data/piper/` avec progression, synthèse WAV locale puis conversion in `src/server/tts/piper.ts`
- [X] T051 [US3] Implement audio generation service: génère les répliques manquantes/obsolètes (scope all ou lineIds), convertit via `toLuniiMp3`, met à jour `textHash`, publie la progression in `src/server/audio/generate.ts`
- [X] T052 [US3] Implement segment and announcement assembly with `concat` (silence court entre répliques) in `src/server/audio/generate.ts` (`AudioService.assemble`)
- [X] T053 [US3] Implement voice routes `GET /api/voices`, `POST /api/voices/preview`, `POST /api/projects/:id/audio/generate` (progression SSE), `POST /api/projects/:id/audio/assemble` in `src/server/routes/voices.ts`
- [X] T054 [US3] Create the Voices page: un bloc par personnage et narrateur, choix de la source (enregistrement / voix locale / ElevenLabs, ce dernier marqué payant), choix de la voix avec aperçu, « Générer les audios » avec progression, état par réplique, régénération individuelle in `src/web/pages/Voices.tsx`
- [X] T055 [P] [US3] Create a reusable audio player component in `src/web/components/AudioPlayer.tsx`

**Checkpoint**: une histoire peut être entièrement mise en voix par synthèse et exportée

---

## Phase 6: User Story 4 - Enregistrer ses propres voix dans l'application (Priority: P2)

**Goal**: script par personnage et enregistrement réplique par réplique au micro, mélangeable
avec la synthèse.

**Independent Test**: quickstart V5 (partie enregistrement) et V6.

### Tests for User Story 4 ⚠️

- [ ] T056 [P] [US4] Write tests for the script builder (répliques groupées par personnage, ordre de l'histoire, contexte de scène, statut à enregistrer / obsolète) in `tests/audio/script.test.ts`
- [ ] T057 [P] [US4] Write route tests for recording upload (WebM d'exemple → MP3 mono 44,1 kHz, niveaux analysés, textHash enregistré) in `tests/api/recording.test.ts`

### Implementation for User Story 4

- [ ] T058 [US4] Implement the recording script builder (FR-011) in `src/server/audio/script.ts`
- [ ] T059 [US4] Implement `GET /api/projects/:id/script` and `PUT /api/projects/:id/lines/:lineId/recording` (multipart, conversion `toLuniiMp3`, `levels`, source `recorded`) in `src/server/routes/recording.ts`
- [ ] T060 [P] [US4] Create the recorder component with MediaRecorder: niveau en direct, enregistrer / arrêter / réécouter / refaire / valider, avertissement si prise silencieuse ou saturée, message d'aide si le micro est refusé avec renvoi vers les autres options in `src/web/components/Recorder.tsx`
- [ ] T061 [US4] Create the Recording page: choix du personnage, script réplique par réplique avec contexte, navigation suivante/précédente sans quitter l'écran (SC-008), répliques obsolètes signalées in `src/web/pages/Recording.tsx`

**Checkpoint**: voix enregistrées et synthétiques peuvent être mélangées dans une même histoire

---

## Phase 7: User Story 5 - Pictos illustrés adaptés à l'histoire (Priority: P3)

**Goal**: couverture et un picto par option, dans un style commun, régénérables ou importés,
toujours au format 320×240.

**Independent Test**: quickstart V7 ; tests `tests/api/pictos.test.ts` avec doublure image.

### Tests for User Story 5 ⚠️

- [x] T062 [P] [US5] Write picto service tests with a fake `ImageProvider`: une couverture + un picto par option, prompt contenant le style commun et la description constante des personnages, import d'image recadré en 320×240, suppression → picto par défaut, picto marqué obsolète si le style change in `tests/api/pictos.test.ts`

### Implementation for User Story 5

- [x] T063 [P] [US5] Define the `ImageProvider` interface and the 4 à 6 predefined styles (aquarelle douce, papier découpé, dessin animé, crayons de couleur…) with their prompt fragments in `src/server/images/provider.ts` and `src/server/images/styles.ts`
- [x] T064 [P] [US5] Implement the Gemini Nano Banana images provider with `@google/genai` (modèle depuis les réglages, défaut `gemini-nano-banana-2.1`, format 4:3, erreurs traduites : clé, quota, réseau, refus de sécurité) in `src/server/images/gemini.ts`
- [x] T065 [US5] Implement the picto service: prompt (style + personnages + objet de l'option, sujet unique centré, fort contraste, pas de texte, contenu adapté aux enfants), conversion `toLuniiPng`, `promptHash`, import, retour au défaut in `src/server/images/pictos.ts`
- [x] T066 [US5] Implement routes `GET /api/styles`, `POST /api/projects/:id/pictos/generate` (SSE), `PUT` and `DELETE /api/projects/:id/pictos/:target` (target `cover` ou `option:<optionId>`) in `src/server/routes/pictos.ts`
- [x] T067 [P] [US5] Create the Lunii screen preview component (cadre 320×240 à l'échelle, rendu fidèle) in `src/web/components/LuniiScreen.tsx`
- [x] T068 [US5] Create the Pictos page: choix du style, « Générer » (payant), grille couverture + options avec aperçu Lunii, régénérer / importer / revenir au défaut par picto in `src/web/pages/Pictos.tsx`

**Checkpoint**: le pack exporté affiche des pictos illustrés cohérents

---

## Phase 8: User Story 6 - Bibliothèque de projets et reprise du travail (Priority: P3)

**Goal**: lister, reprendre, dupliquer et supprimer les projets.

**Independent Test**: quickstart V11.

### Tests for User Story 6 ⚠️

- [ ] T069 [P] [US6] Write route tests: liste (titre, couverture, étape, date), duplication (copie profonde des médias, nouveaux ids), suppression du dossier, reprise à la même étape in `tests/api/library.test.ts`

### Implementation for User Story 6

- [ ] T070 [US6] Implement `GET /api/projects` listing, `POST /api/projects/:id/duplicate` and `DELETE /api/projects/:id` in `src/server/routes/projects.ts`
- [ ] T071 [US6] Create the Library page (cartes avec couverture, titre, étape, date ; ouvrir à l'étape atteinte ; dupliquer ; supprimer avec confirmation ; « Nouvelle histoire ») as the home page in `src/web/pages/Library.tsx`

**Checkpoint**: toutes les user stories sont fonctionnelles

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T072 [P] Add a safety test panel of 20 varied briefs including borderline ones, with recorded responses, checking the prompts' safety instructions and the handling of refused/softened content (SC-005) in `tests/ai/safety-panel.test.ts`
- [ ] T073 [P] Add a `git status`-based check script ensuring no key value is tracked and `data/`, `.env`, `tests/output/` are ignored in `scripts/check-secrets.ts` and `.gitignore`
- [ ] T074 Review all French UI copy and error messages for a non-technical parent (SC-006) across `src/web/pages/`
- [ ] T075 Run `npm run typecheck` and `npm test`; fix failures
- [ ] T076 Run quickstart.md validation V1–V13, including the real STUdio import and listening on the Lunii (V10); if an ending with `okTransition: null` blocks, switch endings to transition to the `start` action in `src/server/pack/mapping.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **US2 (Phase 3)**: after Foundational ; uses fixture data, no dependency on other stories
- **US1 (Phase 4)**: after Foundational ; reuses `story/validate.ts` (T023) — do Phase 3 first
- **US3, US4 (Phases 5–6)**: after US1 (they need a real story graph); US4 reuses T052 assembly and T055 player from US3
- **US5 (Phase 7)**: after US1 (needs options); independent of US3/US4
- **US6 (Phase 8)**: after Foundational ; best after US1 for meaningful projects
- **Polish (Phase 9)**: after all desired stories

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Schemas → services → routes → pages
- Story complete before moving to next priority

### Parallel Opportunities

- Setup: T002–T005 in parallel
- Foundational: T007, T009, T010, T011 in parallel after T006; T014–T017 in parallel
- US2: all tests T018–T022 in parallel
- US1: T032–T035 in parallel ; pages T041–T043 in parallel
- US3: T048–T050 in parallel ; US5: T063, T064, T067 in parallel
- After US1: US3/US4 track and US5 track can run in parallel

---

## Parallel Example: User Story 2

```bash
# Write all US2 tests together (they must fail first):
Task: "Create the reference fixture in tests/fixtures/reference-story.json and tests/fixtures/media.ts"
Task: "Write graph validity tests in tests/graph/validate.test.ts"
Task: "Write mapping tests in tests/pack/mapping.test.ts"
Task: "Write archive tests in tests/pack/archive.test.ts"
Task: "Write pre-export check tests in tests/pack/check.test.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Create the Brief page in src/web/pages/Brief.tsx"
Task: "Create the Scenarios page in src/web/pages/Scenarios.tsx"
Task: "Create the size settings panel in src/web/components/SizeSettings.tsx"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3 (US2): pack de référence validé et **importé dans STUdio** → STOP et
   vérifier la compatibilité avant d'aller plus loin
4. Complete Phase 4 (US1): histoires réelles générées par Claude
5. **STOP and VALIDATE**: quickstart V1–V4, V8, V9

### Incremental Delivery

1. Setup + Foundational → base prête
2. US2 → pack de référence compatible (risque levé)
3. US1 → histoires écrites (MVP)
4. US3 → voix de synthèse : première histoire réellement écoutable sur la Lunii
5. US4 → voix enregistrées
6. US5 → pictos illustrés
7. US6 → bibliothèque
8. Polish → panel de sécurité, contrôle des secrets, validation complète

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
