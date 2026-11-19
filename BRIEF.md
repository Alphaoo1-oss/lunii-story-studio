# Lunii Story Studio — brief initial

Notes recueillies avant `/speckit-specify` (2026-10-27).

## Objectif
Application web locale pour créer des histoires **interactives** (à choix) pour une Lunii,
exportées en **pack compatible STUdio** (.zip), puis transférées sur la Lunii avec un outil
tiers (ex. Lunii QT / STUdio).

## Parcours utilisateur
1. **Saisie** : un champ texte libre pour donner les indications : noms et âges des
   personnages, thème (ex. Halloween), etc.
2. **Scénarios** : l'app propose **4 scénarios différents**. L'utilisateur en choisit un.
3. **Histoire** : génération de l'histoire interactive complète (embranchements choisis
   avec la molette de la Lunii).
4. **Voix**, au choix :
   - script par personnage / réplique pour **enregistrer ses propres voix directement dans
     l'app** (micro du navigateur, script affiché) ;
   - ou **voix générées automatiquement** : TTS local ou ElevenLabs.
5. **Pictos** : génération d'images travaillées, adaptées à l'histoire, pour l'écran de la
   Lunii (converties au format attendu).
6. **Export** : pack STUdio prêt à importer.

## Choix techniques retenus
- IA texte : **Claude (API Anthropic)**.
- Pictos : à recommander. Piste : API de génération d'images, puis conversion
  automatique au format Lunii.
- Voix : enregistrement dans le navigateur + TTS (local et/ou ElevenLabs).
