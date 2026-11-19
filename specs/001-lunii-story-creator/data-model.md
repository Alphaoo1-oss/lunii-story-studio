# Data Model: Créateur d'histoires interactives pour Lunii

**Date**: 2026-10-27 | **Plan**: [plan.md](plan.md)

Tout le modèle d'un projet est stocké dans `data/projects/<projectId>/project.json`, et les
médias dans les sous-dossiers du projet. Les schémas sont définis une fois (Zod) dans
`src/shared/` et partagés par le serveur et l'interface.

## Vue d'ensemble

```text
Project 1──* Scenario          (4 par proposition ; 1 retenu)
Project 1──* Character         (dont le narrateur)
Project 1──1 StoryGraph
StoryGraph 1──* Segment        (étapes : narration + répliques)
StoryGraph 1──* Choice         (points de choix)
Choice     1──* ChoiceOption   (2 ou 3) ──> Segment cible
Segment    1──* Line           (répliques ordonnées) ──> Character
Line       0..1 AudioClip
Segment    0..1 AudioClip      (audio assemblé)
ChoiceOption 0..1 Picto, 0..1 AudioClip (annonce)
Project    0..1 Picto          (couverture)
Project    1──* ExportRecord
```

## Project

| Champ | Type | Règles |
|-------|------|--------|
| id | string (uuid) | immuable |
| title | string | 1–80 car. ; issu du scénario retenu, modifiable |
| description | string | 0–300 car. ; utilisée dans le pack |
| brief | string | indications libres saisies (FR-001), 1–4000 car. |
| listenerAge | int | 2–10 ans |
| sizeSettings | SizeSettings | voir ci-dessous (FR-029) |
| stage | enum | `brief` → `scenarios` → `story` → `voices` → `pictos` → `export` |
| scenarioBatches | Scenario[][] | historique des propositions (4 par lot) |
| assumptions | string[] | ce que Claude a supposé faute de précision dans les indications |
| selectedScenarioId | string \| null | |
| characters | Character[] | |
| graph | StoryGraph \| null | |
| visualStyle | enum \| null | style commun des pictos (FR-015) |
| coverPicto | Picto \| null | |
| titleAudio | AudioClip \| null | titre lu par le narrateur, joué sur la couverture du pack |
| exports | ExportRecord[] | |
| createdAt / updatedAt | ISO date | `updatedAt` mis à jour à chaque sauvegarde |

**Transitions de `stage`** : on n'avance qu'après validation explicite (principe IV) ; on peut
revenir à toute étape antérieure. Revenir à `scenarios` et choisir un autre scénario après la
génération de l'histoire exige une confirmation, car le graphe sera remplacé.

## SizeSettings (FR-029)

| Champ | Type | Défaut | Règles |
|-------|------|--------|--------|
| choicesPerPath | int | 2 | 1–4 points de choix sur un parcours |
| optionsPerChoice | int | 2 | 2 ou 3 |
| allowMerging | bool | true | les branches peuvent se rejoindre |
| minutesPerPath | int | 10 | 5–20 minutes d'écoute par parcours |

**Estimation** (affichée en direct) : sans rejonction, `fins = optionsPerChoice ^
choicesPerPath` ; avec rejonction, nombre de segments ≈ `1 + choicesPerPath ×
optionsPerChoice`. Durée totale à produire = nombre de segments × durée moyenne d'un segment.
Avertissement au-delà de 40 segments ou de 60 minutes totales.

## Scenario

| Champ | Type | Règles |
|-------|------|--------|
| id | string | |
| title | string | |
| summary | string | 2–5 phrases |
| characters | {name, age?, description}[] | reprend les prénoms/âges du brief |
| choiceIdeas | string[] | exemples de choix proposés à l'enfant |

## Character

| Champ | Type | Règles |
|-------|------|--------|
| id | string | |
| name | string | unique dans le projet ; `Narrateur` pour le narrateur |
| isNarrator | bool | exactement un narrateur par projet |
| age | int \| null | |
| description | string | apparence et caractère ; sert aux prompts d'images (cohérence visuelle) |
| voice | VoiceAssignment \| null | |

## VoiceAssignment (FR-009)

| Champ | Type | Règles |
|-------|------|--------|
| source | enum | `recorded` \| `voicebox` \| `piper` \| `elevenlabs` (`voicebox` : `voiceId` = identifiant du profil Voicebox) |
| voiceId | string \| null | requis pour `piper` et `elevenlabs` |
| settings | object | ex. vitesse, stabilité (selon le fournisseur) |

## StoryGraph

| Champ | Type | Règles |
|-------|------|--------|
| startSegmentId | string | segment d'introduction |
| segments | Segment[] | |
| choices | Choice[] | |

**Règles de validité** (FR-005, contrôlées en code à chaque modification et avant export) :

1. `startSegmentId` existe.
2. Chaque segment a exactement une suite : `next = { kind: "choice", choiceId }`,
   `{ kind: "segment", segmentId }` ou `{ kind: "end" }`.
3. Chaque option de choix cible un segment existant.
4. Tout segment est atteignable depuis le segment de départ.
5. Aucun cycle (le graphe est orienté acyclique) : chaque parcours se termine par une fin.
6. Les réglages de taille sont respectés : nombre de points de choix sur tout parcours ≤
   `choicesPerPath`, options par choix = `optionsPerChoice`.

## Segment

| Champ | Type | Règles |
|-------|------|--------|
| id | string | |
| title | string | court, pour l'arbre |
| lines | Line[] | ≥ 1 ; ordonnées |
| next | voir règle 2 | |
| audio | AudioClip \| null | assemblage des répliques (FR-013) |
| isEnding | bool | dérivé : `next.kind === "end"` |

La question posée à l'enfant (« Que doit faire Léo ? ») est la dernière réplique du segment
précédant un choix.

## Line

| Champ | Type | Règles |
|-------|------|--------|
| id | string | |
| characterId | string | personnage ou narrateur |
| text | string | 1–1000 car. |
| textHash | string | empreinte du texte au moment de la production de l'audio |
| audio | AudioClip \| null | |

**État dérivé** (FR-014) : `missing` (pas d'audio), `stale` (`textHash` différent de
l'empreinte du texte actuel, ou voix du personnage changée), `ok`.

## Choice / ChoiceOption

| Choice | Type | Règles |
|--------|------|--------|
| id | string | |
| prompt | string | rappel de la question (pour l'arbre) |
| options | ChoiceOption[] | 2 ou 3 |

| ChoiceOption | Type | Règles |
|--------------|------|--------|
| id | string | |
| label | string | 1–60 car. ; annoncé à la molette |
| targetSegmentId | string | doit exister |
| announceAudio | AudioClip \| null | lecture du libellé, par la voix du narrateur |
| picto | Picto \| null | |

## AudioClip

| Champ | Type | Règles |
|-------|------|--------|
| file | string | chemin relatif au projet (`audio/…mp3`), MP3 mono 44,1 kHz |
| source | enum | `recorded` \| `voicebox` \| `piper` \| `elevenlabs` \| `assembled` |
| durationSec | number | |
| peakDb / silent / clipped | number / bool / bool | analyse de niveau des prises (R7) |
| sourceHash | string \| null | empreinte de ce dont l'audio est issu (segment : fichiers et textes de ses répliques ; annonce et titre : voix du narrateur + texte) ; sert à détecter un audio obsolète |
| createdAt | ISO date | |

## Picto

| Champ | Type | Règles |
|-------|------|--------|
| file | string | `images/…png`, toujours 320×240 |
| origin | enum | `generated` \| `imported` \| `default` |
| style | enum \| null | style au moment de la génération |
| promptHash | string \| null | pour détecter un picto obsolète (style changé) |

## ExportRecord

| Champ | Type | Règles |
|-------|------|--------|
| file | string | `exports/<titre>-<date>.zip` |
| createdAt | ISO date | |
| stats | {segments, choices, endings, totalMinutes} | |

## Settings (global, `data/settings.json`, hors projets)

| Champ | Type | Règles |
|-------|------|--------|
| anthropicApiKey / elevenLabsApiKey / geminiApiKey | string \| null | jamais renvoyées en clair à l'interface |
| textProvider | `subscription` \| `api` | défaut `subscription` : abonnement Claude de l'utilisateur via le SDK Claude Agent (usage personnel) ; `api` : clé API Anthropic |
| textModel | string | défaut `claude-opus-5-5` (réglable, ex. `claude-sonnet-5-5` pour un coût réduit de moitié) |
| imageModel | string | défaut `gemini-nano-banana-2.1` (Nano Banana) |
| port | int | défaut 5174 (le dossier de données vient de `DATA_DIR`, défaut `./data`) |
