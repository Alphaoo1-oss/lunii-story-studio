# Contract: API HTTP locale (serveur ↔ interface)

Serveur sur `http://127.0.0.1:5174` (port réglable ; en développement, l'interface Vite sur
`127.0.0.1:5173` relaie `/api` et `/media` vers lui), JSON, sans authentification
(mono-utilisateur, écoute locale uniquement). Les schémas des corps sont les schémas Zod de
`src/shared/` (voir [data-model.md](../data-model.md)). Erreurs : `{ error: { code,
message } }`, message en français.

Les routes marquées 💲 appellent un service externe payant : elles ne sont appelées que sur
action explicite de l'utilisateur (FR-026).

## Réglages

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/settings` | état des réglages ; les clés sont renvoyées sous la forme `{ configured: bool, last4: string }` |
| PUT | `/api/settings` | enregistre clés et modèles |
| POST | `/api/settings/test/:service` | teste une clé (`anthropic`, `elevenlabs`, `gemini`) |

## Projets (US6)

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/projects` | liste : id, titre, couverture, étape, date |
| POST | `/api/projects` | crée un projet vide |
| GET | `/api/projects/:id` | projet complet + états dérivés (audios obsolètes, validité du graphe, estimation) |
| PATCH | `/api/projects/:id` | modifie brief, âge, réglages de taille, titre, style, étape |
| POST | `/api/projects/:id/duplicate` | duplique |
| DELETE | `/api/projects/:id` | supprime (confirmation côté interface) |

## Scénarios et histoire (US1)

| Méthode | Route | Rôle |
|---------|-------|------|
| POST 💲 | `/api/projects/:id/scenarios` | génère 4 scénarios ; corps optionnel `{ extraHint }` |
| POST | `/api/projects/:id/scenarios/:scenarioId/select` | retient un scénario et crée les personnages |
| POST 💲 | `/api/projects/:id/story` | génère l'histoire complète selon `sizeSettings` |
| PATCH | `/api/projects/:id/segments/:segmentId` | modifie titre/répliques d'un segment |
| PATCH | `/api/projects/:id/options/:optionId` | modifie le libellé d'une option |
| POST 💲 | `/api/projects/:id/segments/:segmentId/regenerate` | régénère un seul segment ; corps optionnel `{ instruction }` |
| PATCH | `/api/projects/:id/characters/:characterId` | modifie description et voix |

## Voix (US3, US4)

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/voices?source=piper\|elevenlabs` | voix disponibles |
| POST 💲* | `/api/voices/preview` | `{ source, voiceId, text }` → MP3 d'aperçu |
| POST 💲* | `/api/projects/:id/audio/generate` | génère les audios manquants ou obsolètes ; corps `{ scope: "all" \| { lineIds } }` ; réponse en flux de progression (SSE) |
| PUT | `/api/projects/:id/lines/:lineId/recording` | envoie une prise (multipart, WebM/Opus) → conversion + analyse de niveau |
| POST | `/api/projects/:id/audio/assemble` | assemble l'audio des segments et des annonces |
| GET | `/api/projects/:id/script` | script d'enregistrement par personnage (FR-011) |

\* payant seulement avec la source `elevenlabs` ; Piper est local et gratuit.

## Pictos (US5)

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/styles` | styles visuels proposés |
| POST 💲 | `/api/projects/:id/pictos/generate` | `{ scope: "all" \| { targets } }` ; flux de progression (SSE) |
| PUT | `/api/projects/:id/pictos/:target` | importe une image (multipart) → recadrage 320×240 |
| DELETE | `/api/projects/:id/pictos/:target` | revient au picto par défaut |

`target` = `cover` ou `option:<optionId>`.

## Export (US2)

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/projects/:id/export/check` | liste des manques et erreurs (FR-019) |
| POST | `/api/projects/:id/export` | produit le pack (voir [studio-pack.md](studio-pack.md)) ; 422 avec les erreurs si invalide |
| GET | `/api/projects/:id/exports/:file` | téléchargement du .zip |

## Médias

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/media/:projectId/*` | sert les fichiers audio et images du projet (lecture seule) |
