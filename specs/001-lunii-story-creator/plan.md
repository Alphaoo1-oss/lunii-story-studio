# Implementation Plan: Créateur d'histoires interactives pour Lunii

**Branch**: `001-lunii-story-creator` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-lunii-story-creator/spec.md`

## Summary

Application web locale, en français, qui transforme des indications libres en histoire
interactive pour Lunii : 4 scénarios proposés par Claude, génération d'un arbre d'histoire
dont la taille se règle finement, voix enregistrées dans le navigateur ou synthétisées
(Piper en local, ElevenLabs), pictos illustrés générés (Nano Banana de Google Gemini) dans un style
commun, puis export d'un pack STUdio validé. Approche : un seul projet TypeScript (serveur
Fastify + interface React), stockage en fichiers locaux, schémas Zod partagés, et un module
d'export isolé et fortement testé sur un pack de référence ([research.md](research.md)).

## Technical Context

**Language/Version**: TypeScript 5.x sur Node.js 24 (serveur) ; navigateur récent (interface)

**Primary Dependencies**: Fastify, React + Vite, Zod, `@anthropic-ai/sdk`, ElevenLabs (API
HTTP), Piper (binaire local téléchargé à la demande), Google Gemini Nano Banana (`@google/genai`), `ffmpeg-static`,
`sharp`, `yazl`/`yauzl`

**Storage**: fichiers locaux — `data/projects/<id>/project.json` + `audio/`, `images/`,
`exports/` ; réglages dans `data/settings.json` (exclu de git)

**Testing**: Vitest (unitaires et intégration côté serveur) ; doublures pour toutes les API
externes ; pack de référence vérifié par relecture de l'archive

**Target Platform**: poste personnel Windows (principal), macOS ou Linux ; serveur sur
`127.0.0.1` ; Chrome/Edge/Firefox

**Project Type**: application web locale (serveur + interface dans un même paquet)

**Performance Goals**: 4 scénarios en moins de 30 s ; histoire complète par défaut en moins
de 2 min ; export d'un pack en moins de 30 s ; parcours complet en moins de 20 min (SC-001)

**Constraints**: hors ligne possible sauf génération IA ; aucun appel payant sans action
explicite ; clés jamais renvoyées au navigateur ; médias MP3 mono 44,1 kHz et PNG 320×240

**Scale/Scope**: 1 utilisateur, dizaines de projets ; histoire jusqu'à ~40 segments et
~60 min d'audio total ; ~8 écrans (bibliothèque, saisie, scénarios, histoire, voix,
enregistrement, pictos, export, réglages)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Vérification | Statut |
|----------|--------------|--------|
| I. Contenu adapté aux enfants | Prompt système commun avec règles de sécurité et âge de l'auditeur pour texte **et** images ; panel de 20 demandes en validation (SC-005) ; aucun export sans affichage préalable | ✅ |
| II. Compatibilité STUdio | Contrat [studio-pack.md](contracts/studio-pack.md) dérivé du schéma réel ; validateur bloquant ; écriture atomique ; formats médias vérifiés par analyse réelle ; import STUdio manuel en validation finale | ✅ |
| III. Local d'abord, secrets | Écoute `127.0.0.1` ; données dans `data/` ignoré par git ; clés jamais renvoyées ; alternatives locales : enregistrement, Piper, pictos par défaut ou importés | ✅ |
| IV. L'utilisateur garde la main | Étapes validées une à une (`stage`) ; régénération par élément ; détection des audios/pictos obsolètes ; sauvegarde automatique | ✅ |
| V. Simplicité | Un seul paquet, un seul langage, pas de base de données ni de comptes ; une dépendance par besoin | ✅ |
| VI. Tests du pack | Tests du module d'export écrits en premier ; pack de référence ; doublures pour les API (aucune clé en test) | ✅ |
| Contraintes produit | Interface et contenus en français ; routes payantes marquées et déclenchées explicitement ; erreurs en français sans perte | ✅ |

**Re-check post-design** : ✅ aucun écart. Points de vigilance à suivre en implémentation :
le comportement exact de `okTransition: null` en fin d'histoire sur la Lunii (retour au menu)
est à confirmer lors de la validation V10 ; s'il pose problème, ajouter une transition vers
l'action `start` (retour au début, également conforme à FR-021).

## Project Structure

### Documentation (this feature)

```text
specs/001-lunii-story-creator/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── studio-pack.md   # format du pack exporté (interface critique)
│   └── http-api.md      # API locale serveur ↔ interface
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
package.json             # scripts dev / build / start / test
.env.example             # modèle de configuration, sans valeurs
src/
├── shared/              # schémas Zod + types partagés (modèle, API)
│   ├── model.ts
│   └── api.ts
├── server/
│   ├── index.ts         # Fastify, écoute 127.0.0.1, sert l'interface buildée
│   ├── routes/          # settings, projects, story, voices, pictos, export
│   ├── storage/         # lecture/écriture atomique des projets et réglages
│   ├── story/           # graphe : validation, estimation, édition
│   ├── ai/              # client Claude, prompts (sécurité enfant), validation des réponses
│   ├── tts/             # TtsProvider : piper, elevenlabs
│   ├── images/          # ImageProvider : gemini (Nano Banana) ; styles ; pictos par défaut ; sharp
│   ├── audio/           # ffmpeg : conversion, analyse de niveau, assemblage
│   └── pack/            # export STUdio : mapping, médias, validateur, zip
└── web/
    ├── main.tsx
    ├── pages/           # Library, Brief, Scenarios, Story, Voices, Recorder, Pictos, Export, Settings
    ├── components/      # arbre d'histoire, lecteur audio, enregistreur, aperçu écran Lunii
    └── lib/             # client typé de l'API locale (pas « api/ » : le proxy Vite relaie /api)

tests/
├── fixtures/            # histoire de référence, médias factices, réponses IA enregistrées
├── pack/                # contrat studio-pack (prioritaire)
├── graph/               # validité + estimation
├── ai/                  # prompts et validation des réponses (doublures)
├── audio/               # conversion et assemblage (ffmpeg réel, fichiers courts)
└── api/                 # routes Fastify (inject), avec doublures des services

data/                    # créé à l'exécution, ignoré par git
```

**Structure Decision**: un seul paquet npm avec `src/server`, `src/web` et `src/shared`
(principe V) plutôt que deux projets séparés : l'interface et le serveur partagent les mêmes
schémas, et un seul `npm run dev` lance tout. Le module `src/server/pack/` est indépendant
du serveur HTTP et de l'IA pour être testé seul, en premier (principe VI).

## Implementation Phasing (guide pour /speckit-tasks)

1. **Fondations** : squelette du projet, schémas partagés, stockage, réglages et clés.
2. **US2 avant tout le reste côté serveur** : module `pack/` + validateur + pack de référence
   (tests d'abord), avec médias factices, pour lever le risque principal tôt.
3. **US1** : génération des scénarios et de l'histoire, arbre éditable, réglages de taille.
4. **US3 / US4** : voix (Piper, ElevenLabs), enregistreur, assemblage audio.
5. **US5** : pictos, styles, import, pictos par défaut.
6. **US6** : bibliothèque, duplication, suppression.
7. **Validation** : quickstart V1–V13, dont l'import réel dans STUdio et l'écoute sur Lunii.

## Complexity Tracking

Aucun écart à la constitution ; section sans objet.
