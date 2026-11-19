# Contract: Pack STUdio exporté

Ce contrat est l'interface externe critique du projet (constitution, principe II). Les tests
de `tests/pack/` le vérifient sur un pack de référence.

## Contenu de l'archive

```text
<titre>.zip
├── story.json
├── thumbnail.png          # couverture, PNG 320×240
└── assets/
    ├── <sha1>.mp3         # MP3 mono 44 100 Hz, normalisé crête 0 dB
    └── <sha1>.png         # PNG 320×240
```

- Les médias sont dédupliqués par empreinte SHA-1 de leur contenu ; `story.json` les
  référence par nom de fichier (`"<sha1>.mp3"`), sans le préfixe `assets/`.
- Aucun autre fichier dans l'archive.

## story.json

```json
{
  "format": "v1",
  "title": "Léo et Mia et la citrouille magique",
  "description": "Une aventure d'Halloween pas trop effrayante.",
  "version": 1,
  "nightModeAvailable": false,
  "stageNodes": [ /* StageNode */ ],
  "actionNodes": [ /* ActionNode */ ]
}
```

```text
StageNode {
  uuid: string (uuid v4)
  type: "stage"
  name: string
  squareOne: boolean            # true uniquement pour le nœud de couverture
  image: string | null          # "<sha1>.png"
  audio: string | null          # "<sha1>.mp3"
  okTransition:   { actionNode: string, optionIndex: number } | null
  homeTransition: { actionNode: string, optionIndex: number } | null
  controlSettings: { wheel, ok, home, pause, autoplay: boolean }
  position: { x: number, y: number }
}

ActionNode {
  id: string (uuid v4)
  name: string
  options: string[]             # uuids de StageNode, ordre = ordre à la molette
  position: { x: number, y: number }
}
```

Règle d'or : un StageNode ne mène qu'à un ActionNode ; un ActionNode ne contient que des
StageNodes.

## Correspondance modèle → pack

| Élément du modèle | StageNode(s) produits | controlSettings (wheel, ok, home, pause, autoplay) | okTransition |
|-------------------|-----------------------|---------------------------------------------------|--------------|
| Couverture du projet | `cover` : image = couverture, audio = titre lu par le narrateur, `squareOne: true` | true, true, false, false, false | → action `start` (option 0) |
| Segment suivi d'un choix | `seg-<id>` : audio du segment, pas d'image | false, false, true, true, true | → action `choice-<choiceId>` (option 0) |
| Segment suivi d'un segment | `seg-<id>` | false, false, true, true, true | → action `next-<id>` à option unique |
| Segment de fin | `seg-<id>` | false, false, true, true, true | `null` (retour au menu de la Lunii) |
| Option de choix | `opt-<id>` : image = picto, audio = annonce du libellé | true, true, true, false, false | → action `go-<optionId>` à option unique : `seg-<cible>` |

| ActionNode | options |
|------------|---------|
| `start` | [`seg-<startSegmentId>`] |
| `choice-<choiceId>` | [`opt-<id>` pour chaque option, dans l'ordre] |
| `next-<segmentId>` | [`seg-<segment suivant>`] |
| `go-<optionId>` | [`seg-<targetSegmentId>`] |

- Les branches qui se rejoignent produisent plusieurs `okTransition` vers le même ActionNode
  `go-…`/`next-…`, ou plusieurs options visant le même `seg-…` : c'est autorisé.
- `homeTransition` : `null` sur tous les nœuds (le bouton maison ramène au menu de la Lunii).
- `position` : disposition calculée en couches (profondeur × rang) pour un affichage lisible
  si le pack est ouvert dans l'éditeur STUdio.

## Validation avant export (bloquante)

1. Le graphe du projet est valide (règles de [data-model.md](../data-model.md#storygraph)).
2. Chaque segment a un audio à jour ; chaque option a un audio d'annonce et un picto (un picto
   par défaut est créé automatiquement si absent, FR-018).
3. Toutes les références `okTransition.actionNode` existent et `optionIndex` est dans les
   bornes ; toutes les entrées de `options` existent ; exactement un `squareOne`.
4. Chaque fichier référencé est présent dans `assets/` et respecte son format (MP3 mono
   44,1 kHz ; PNG 320×240), vérifié par analyse réelle du fichier.
5. Le pack est d'abord écrit dans un fichier temporaire puis renommé : jamais de pack partiel.

Chaque problème est renvoyé sous la forme `{ code, severity: "error" | "warning", message (fr), target: { kind, id } }` ; seuls les `error` bloquent l'export (les écarts aux réglages de taille sont des `warning`)
permettant à l'interface de pointer l'élément fautif (FR-019).
