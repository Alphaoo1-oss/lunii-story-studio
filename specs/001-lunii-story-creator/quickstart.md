# Quickstart & validation: Créateur d'histoires interactives pour Lunii

Guide pour lancer l'application et vérifier de bout en bout qu'elle remplit la spec.

## Prérequis

- Windows 10/11, macOS ou Linux, avec **Node.js 24** ou plus récent.
- Un navigateur récent (Chrome, Edge ou Firefox) et un micro pour l'enregistrement.
- Clés (facultatives selon les fonctions utilisées) : Anthropic (texte, **obligatoire** pour
  générer les histoires), ElevenLabs (voix), Google Gemini (pictos Nano Banana).
- Pour la validation finale : **STUdio** ou **Lunii QT** installé, et une Lunii.

## Installation et lancement

```bash
npm install
```

```bash
npm run dev
```

Ouvrir `http://127.0.0.1:5173`, puis saisir les clés dans **Réglages** et les tester.
ffmpeg est fourni par les dépendances ; Piper et ses voix françaises sont téléchargés par
l'application à la première utilisation de la voix locale.

## Tests automatisés (sans clé ni réseau)

```bash
npm test
```

Attendu : tous les tests passent, dont :
- `tests/pack/` : génération du **pack de référence** (`tests/fixtures/reference-story.json`
  + médias factices), puis relecture de l'archive et vérification du contrat
  [studio-pack.md](contracts/studio-pack.md) (structure, références, formats MP3/PNG réels) ;
- `tests/graph/` : règles de validité du graphe et estimation de taille (FR-005, FR-029) ;
- `tests/ai/` : prompts et validation des réponses de l'IA à partir de réponses enregistrées
  (doublures), y compris des réponses invalides.

## Scénarios de validation manuelle

| # | Parcours | Attendu |
|---|----------|---------|
| V1 | Nouveau projet → indications « Léo, 6 ans, et Mia, 4 ans, Halloween pas trop effrayant », auditeur 5 ans → **Proposer** | 4 scénarios distincts reprenant prénoms et thème (US1-1) |
| V2 | **Autres propositions** avec la précision « avec un chat noir » | 4 nouveaux scénarios avec un chat noir (US1-2) |
| V3 | Choisir un scénario, régler 3 choix × 3 options avec rejonction → **Générer l'histoire** | estimation mise à jour ; arbre conforme aux réglages, toutes branches terminées (US1-3, US1-6) |
| V4 | Modifier une réplique, puis régénérer un autre segment | modification conservée ; seul le segment visé change (US1-4, US1-5) |
| V5 | Voix : narrateur Piper, Léo ElevenLabs, Mia enregistrée dans l'app → générer et enregistrer | aperçus jouables ; chaque segment enchaîne les 3 sources dans l'ordre (US3, US4-3) |
| V6 | Modifier le texte d'une réplique déjà enregistrée | réplique signalée « à réenregistrer » (US4-5) |
| V7 | Pictos : choisir un style → générer ; importer une photo pour une option | couverture + 1 picto par option dans le même style ; image importée recadrée 320×240 (US5) |
| V8 | Supprimer l'audio d'un segment → **Exporter** | export bloqué ; segment fautif désigné (US2-2) |
| V9 | Tout compléter → **Exporter** | un .zip est produit (US2-1) |
| V10 | Importer le .zip dans STUdio, transférer sur la Lunii, parcourir **toutes** les branches | import sans erreur ; à chaque choix, picto + annonce à la molette ; chaque fin ramène au menu sans blocage (US2-3, US2-4, SC-002, SC-003) |
| V11 | Fermer le serveur et le navigateur, relancer | projet retrouvé à la même étape, médias intacts (US6-1, SC-007) |
| V12 | Retirer la clé ElevenLabs puis générer une voix ElevenLabs | message clair en français ; audios existants conservés (US3-4) |
| V13 | Panel de 20 demandes variées dont des demandes limites | aucun contenu inadapté (SC-005) |

## Vérification des secrets

```bash
git status --ignored
```

Attendu : `data/` et `.env` apparaissent comme ignorés ; aucune clé dans les fichiers suivis.
