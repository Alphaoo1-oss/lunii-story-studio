# Feature Specification: Créateur d'histoires interactives pour Lunii

**Feature Branch**: `001-lunii-story-creator`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Lunii Story Studio : application web locale (français) pour créer des histoires interactives pour Lunii. Parcours : 1) un champ texte libre où l'utilisateur donne ses indications (noms et âges des personnages, thème ex. Halloween, etc.) ; 2) l'app propose 4 scénarios différents, l'utilisateur en choisit un ; 3) l'app génère l'histoire interactive complète avec des embranchements (choix faits par l'enfant avec la molette de la Lunii), relisible et modifiable ; 4) voix : soit l'app fournit un script par personnage/réplique pour que l'utilisateur enregistre ses propres voix directement dans l'app (micro du navigateur, script affiché), soit elle génère les voix automatiquement (TTS local ou ElevenLabs) ; 5) l'app génère des pictos travaillés adaptés à l'histoire pour l'écran de la Lunii ; 6) export d'un pack compatible STUdio (.zip) à importer ensuite via un outil tiers comme Lunii QT. IA texte : Claude (API Anthropic). Voir BRIEF.md."

## Clarifications

### Session 2026-10-27

- Q: Un pack contient-il une seule histoire ou peut-il en regrouper plusieurs ? → A: Un pack =
  une histoire (FR-023).
- Q: La taille des histoires est-elle fixe ou réglable ? → A: Réglable finement : nombre de
  choix, options par choix, branches qui se rejoignent, durée visée (FR-029).

## User Scenarios & Testing *(mandatory)*

Acteur unique : **le créateur** (un parent ou proche), qui utilise l'application sur son
ordinateur. Bénéficiaire final : **l'enfant auditeur**, qui écoute l'histoire sur sa Lunii et
fait les choix avec la molette.

### User Story 1 - De l'idée à l'histoire interactive écrite (Priority: P1)

Le créateur décrit en texte libre ce qu'il veut : prénoms et âges des personnages, âge de
l'enfant auditeur, thème (ex. Halloween), ambiance, éléments à inclure. L'application propose
**4 scénarios différents** (titre + résumé court + personnages + idée des choix offerts). Le
créateur en choisit un (ou demande 4 nouvelles propositions). L'application écrit alors
l'histoire interactive complète : narration, répliques attribuées aux personnages, points de
choix avec leurs options, et fins. Le créateur relit l'histoire sous forme d'arbre (étapes et
embranchements), modifie librement les textes et peut régénérer un passage isolé.

**Why this priority**: c'est le cœur de la valeur — sans histoire, rien d'autre n'a de sens.
Seule, elle permet déjà d'obtenir une histoire originale à lire ou à enregistrer.

**Independent Test**: saisir « Léo, 6 ans, et sa sœur Mia, 4 ans, une aventure d'Halloween
pas trop effrayante », choisir un scénario, et obtenir une histoire complète, modifiable, dont
toutes les branches mènent à une fin.

**Acceptance Scenarios**:

1. **Given** le créateur a saisi ses indications, **When** il demande des propositions,
   **Then** 4 scénarios distincts (titres et intrigues différents) s'affichent et reprennent
   les prénoms, âges et thème indiqués.
2. **Given** 4 scénarios affichés, **When** aucun ne convient et le créateur demande de
   nouvelles propositions, **Then** 4 nouveaux scénarios sont proposés en tenant compte des
   indications (et éventuellement d'une précision ajoutée).
3. **Given** un scénario choisi, **When** l'histoire est générée, **Then** elle contient une
   introduction, au moins un point de choix proposant 2 à 3 options, et chaque branche se
   termine par une fin.
4. **Given** une histoire générée, **When** le créateur modifie le texte d'une étape ou d'une
   option, **Then** la modification est conservée et visible dans l'arbre.
5. **Given** une histoire générée, **When** le créateur régénère une seule étape, **Then**
   seule cette étape change ; le reste de l'histoire est intact.
6. **Given** un scénario choisi, **When** le créateur règle 3 points de choix à 3 options avec
   branches qui se rejoignent, **Then** l'estimation d'étapes et de durée se met à jour et
   l'histoire générée respecte ces réglages.

---

### User Story 2 - Export d'un pack STUdio jouable sur la Lunii (Priority: P1)

À partir d'une histoire validée disposant d'un audio pour chaque étape et d'une image pour
chaque élément qui en exige une, le créateur exporte un **pack compatible STUdio** (.zip).
Avant l'export, l'application vérifie que l'histoire est complète et cohérente (aucune étape
sans audio, aucun choix menant nulle part) et indique précisément ce qui manque. Le pack est
ensuite importé par le créateur dans un outil tiers (ex. STUdio, Lunii QT) pour le transférer
sur la Lunii.

**Why this priority**: sans export valide, l'histoire ne peut pas être écoutée sur la Lunii ;
c'est l'aboutissement du parcours (constitution, principe II).

**Independent Test**: exporter une histoire complète (avec des audios et images de test) et
l'importer sans erreur dans STUdio, puis la parcourir en simulant les choix.

**Acceptance Scenarios**:

1. **Given** une histoire complète, **When** le créateur exporte, **Then** un fichier .zip est
   produit et s'importe sans erreur ni retouche dans STUdio.
2. **Given** une étape sans audio, **When** le créateur tente d'exporter, **Then** l'export est
   bloqué et l'étape fautive est désignée avec un message clair en français.
3. **Given** le pack importé sur la Lunii, **When** l'enfant tourne la molette à un point de
   choix, **Then** chaque option s'annonce par son image et un court audio, et la valider
   enchaîne sur la bonne suite de l'histoire.
4. **Given** l'enfant atteint une fin, **When** la fin est terminée, **Then** la Lunii revient
   au début de l'histoire ou au menu, sans blocage.

---

### User Story 3 - Voix générées automatiquement (Priority: P2)

Pour chaque personnage et pour le narrateur, le créateur choisit une voix de synthèse : voix
locale (gratuite, sans connexion) ou voix ElevenLabs (plus expressive, payante). Il peut
écouter un aperçu avant de valider. L'application génère ensuite l'audio de toutes les
étapes, que le créateur peut réécouter et régénérer individuellement.

**Why this priority**: c'est le moyen le plus rapide d'obtenir une histoire complète et
exportable, sans effort d'enregistrement.

**Independent Test**: attribuer une voix à chaque personnage, générer les audios et vérifier
que chaque étape est lue par la voix attribuée à chaque intervenant.

**Acceptance Scenarios**:

1. **Given** une histoire validée, **When** le créateur attribue une voix à chaque
   personnage et au narrateur, **Then** il peut écouter un aperçu de chaque voix.
2. **Given** des voix attribuées, **When** il lance la génération, **Then** chaque étape
   obtient un audio où chaque réplique est lue par la voix de son personnage.
3. **Given** un audio généré qui ne convient pas, **When** le créateur le régénère,
   **Then** seul cet audio est remplacé.
4. **Given** un service de voix indisponible (clé absente, quota épuisé, pas de réseau),
   **When** la génération échoue, **Then** un message explicite s'affiche, les audios déjà
   obtenus sont conservés et le créateur peut réessayer ou choisir une autre voix.

---

### User Story 4 - Enregistrer ses propres voix dans l'application (Priority: P2)

Le créateur choisit d'enregistrer lui-même tout ou partie des voix. L'application affiche un
**script d'enregistrement** organisé par personnage et par réplique ; pour chaque réplique,
il enregistre via le micro de l'ordinateur, réécoute, recommence si besoin, puis valide. Il
peut mélanger : par exemple narrateur enregistré par lui, personnages en voix de synthèse.

**Why this priority**: la voix d'un proche est un fort attachement émotionnel pour l'enfant ;
c'est aussi l'alternative 100 % locale et gratuite.

**Independent Test**: enregistrer toutes les répliques d'un personnage depuis le script,
puis vérifier que l'audio de chaque étape les assemble dans le bon ordre.

**Acceptance Scenarios**:

1. **Given** une histoire validée, **When** le créateur ouvre le script, **Then** il voit les
   répliques regroupées par personnage, dans l'ordre, avec le contexte de la scène.
2. **Given** une réplique affichée, **When** il enregistre puis réécoute, **Then** il peut
   valider la prise ou la refaire autant de fois que voulu.
3. **Given** certaines répliques enregistrées et d'autres en voix de synthèse, **When**
   l'audio des étapes est assemblé, **Then** chaque étape enchaîne les deux sources dans
   l'ordre du texte.
4. **Given** l'accès au micro refusé, **When** le créateur veut enregistrer, **Then**
   l'application explique comment l'autoriser et propose les autres options de voix.
5. **Given** le texte d'une réplique modifié après son enregistrement, **When** le créateur
   consulte le script, **Then** la réplique est signalée comme à réenregistrer.

---

### User Story 5 - Pictos illustrés adaptés à l'histoire (Priority: P3)

L'application génère des pictos illustrés (images affichées sur l'écran de la Lunii) : une
image de couverture pour l'histoire, et une image pour chaque option de choix (ex. « la forêt
hantée » / « le château des citrouilles »). Le créateur choisit un style visuel commun parmi
quelques styles proposés, pour garantir l'homogénéité. Il peut régénérer un picto ou importer
sa propre image. Les images sont automatiquement adaptées au format de l'écran Lunii.

**Why this priority**: les pictos améliorent beaucoup l'expérience de l'enfant aux points de
choix, mais une histoire peut être exportée avec des pictos simples par défaut.

**Independent Test**: générer les pictos d'une histoire et vérifier qu'ils s'affichent
correctement, lisibles, dans l'aperçu au format de l'écran Lunii.

**Acceptance Scenarios**:

1. **Given** une histoire validée, **When** le créateur choisit un style et lance la
   génération, **Then** une couverture et un picto par option de choix sont produits dans ce
   style.
2. **Given** un picto généré, **When** le créateur le régénère ou importe sa propre image,
   **Then** seule cette image change et elle est adaptée au format de l'écran Lunii.
3. **Given** des pictos générés, **When** le créateur les consulte, **Then** il voit un aperçu
   fidèle au rendu sur l'écran Lunii (taille et cadrage).
4. **Given** la génération d'images indisponible, **When** le créateur exporte, **Then** des
   pictos par défaut (texte du titre ou de l'option sur fond simple) sont utilisés.

---

### User Story 6 - Bibliothèque de projets et reprise du travail (Priority: P3)

Le créateur retrouve la liste de ses histoires (en cours ou terminées), reprend un projet là
où il l'avait laissé, le duplique pour en faire une variante, ou le supprime.

**Why this priority**: indispensable dès qu'on crée plusieurs histoires ou qu'on travaille en
plusieurs fois, mais pas nécessaire pour une première histoire.

**Independent Test**: créer une histoire, fermer l'application, la rouvrir et reprendre
exactement à la même étape.

**Acceptance Scenarios**:

1. **Given** un projet en cours, **When** l'application est fermée puis rouverte, **Then** le
   projet est retrouvé à la même étape avec tout son contenu (textes, audios, images).
2. **Given** plusieurs projets, **When** le créateur ouvre la bibliothèque, **Then** il voit
   pour chacun le titre, la couverture, l'étape atteinte et la date de modification.
3. **Given** un projet, **When** le créateur le supprime, **Then** une confirmation est
   demandée avant suppression.

---

### Edge Cases

- Indications très courtes (« une histoire de pirate ») : l'application complète avec des
  choix raisonnables et indique ce qu'elle a supposé (prénoms, âge cible).
- Indications contenant une demande inadaptée à un enfant : le contenu est adouci ou refusé
  avec une explication, conformément au principe de sécurité.
- Modification du texte après génération des audios ou pictos : les éléments devenus
  obsolètes sont signalés comme à régénérer ou réenregistrer.
- Suppression ou ajout d'une option de choix par le créateur : la structure reste valide
  (chaque option mène à une suite et chaque branche se termine), sinon un avertissement
  l'indique.
- Génération interrompue (fermeture de l'application, perte de réseau) : le travail déjà
  obtenu est conservé et la génération peut être relancée.
- Clé de service absente ou invalide : l'étape concernée l'indique clairement et oriente vers
  les réglages ; les étapes locales restent utilisables.
- Enregistrement trop faible, saturé ou vide : un avertissement est affiché avant validation
  de la prise.
- Histoire trop longue pour un confort d'écoute : l'application avertit au-delà de la durée
  cible.
- Réglages produisant beaucoup d'étapes (ex. 4 choix à 3 options sans branches qui se
  rejoignent, soit des dizaines de fins) : l'estimation l'affiche et l'application avertit
  du volume à enregistrer ou générer, en suggérant de faire se rejoindre les branches.

## Requirements *(mandatory)*

### Functional Requirements

**Saisie et scénarios**

- **FR-001**: Le système MUST proposer un champ de texte libre pour décrire l'histoire
  (personnages, prénoms, âges, thème, ambiance, éléments souhaités) ainsi que l'âge de
  l'enfant auditeur.
- **FR-002**: Le système MUST proposer exactement 4 scénarios distincts à partir des
  indications, chacun avec un titre, un résumé, la liste des personnages et l'idée des choix
  proposés.
- **FR-003**: Les créateurs MUST pouvoir demander de nouvelles propositions, éventuellement
  après avoir ajouté une précision, et choisir un scénario.
- **FR-029**: Les créateurs MUST pouvoir régler, avant la génération de l'histoire : le nombre de
  points de choix sur un parcours (1 à 4), le nombre d'options par choix (2 ou 3), la
  possibilité que des branches se rejoignent, et la durée d'écoute visée par parcours (5 à
  20 minutes). Des valeurs par défaut sont préremplies, et le système MUST afficher une
  estimation du nombre total d'étapes et de la durée totale à enregistrer ou générer.

**Histoire interactive**

- **FR-004**: Le système MUST générer, à partir du scénario choisi, une histoire interactive
  complète composée d'étapes (narration et répliques attribuées à un personnage ou au
  narrateur), de points de choix proposant 2 à 3 options, et de fins.
- **FR-005**: Le système MUST garantir que la structure est valide : chaque option mène à une
  étape existante, chaque étape est atteignable, et chaque branche aboutit à une fin.
- **FR-006**: Le système MUST présenter l'histoire sous forme d'arbre navigable et permettre de
  modifier le texte de toute étape, réplique ou option.
- **FR-007**: Les créateurs MUST pouvoir régénérer individuellement une étape, une option ou
  une fin, sans modifier le reste.
- **FR-008**: Le système MUST adapter vocabulaire, longueur et intensité émotionnelle à l'âge
  de l'enfant auditeur, et exclure tout contenu inadapté aux enfants.

**Voix**

- **FR-009**: Le système MUST permettre d'attribuer à chaque personnage et au narrateur une
  source de voix : enregistrement personnel, voix de synthèse locale, ou voix ElevenLabs.
- **FR-010**: Le système MUST permettre d'écouter un aperçu d'une voix de synthèse avant de
  l'attribuer.
- **FR-011**: Le système MUST afficher un script d'enregistrement organisé par personnage et par
  réplique, avec le contexte de la scène.
- **FR-012**: Les créateurs MUST pouvoir enregistrer une réplique via le micro, la réécouter, la
  refaire et la valider, dans l'application.
- **FR-013**: Le système MUST assembler l'audio de chaque étape en enchaînant, dans l'ordre du
  texte, les répliques quelle que soit leur source.
- **FR-014**: Le système MUST signaler les audios obsolètes (texte modifié après génération ou
  enregistrement) et permettre de les régénérer ou réenregistrer individuellement.

**Pictos**

- **FR-015**: Le système MUST générer une image de couverture et une image par option de choix,
  dans un style visuel commun choisi parmi plusieurs styles proposés.
- **FR-016**: Les créateurs MUST pouvoir régénérer un picto individuellement ou le remplacer par
  une image importée.
- **FR-017**: Le système MUST adapter automatiquement toute image au format de l'écran Lunii et
  en montrer un aperçu fidèle.
- **FR-018**: Le système MUST fournir des pictos par défaut lisibles lorsqu'aucune image
  générée ou importée n'est disponible.

**Export**

- **FR-019**: Le système MUST vérifier, avant l'export, que l'histoire est complète (audio pour
  chaque étape et chaque option, structure valide) et lister précisément les manques.
- **FR-020**: Le système MUST exporter un pack au format STUdio (.zip) importable sans erreur ni
  retouche dans STUdio et les outils compatibles (ex. Lunii QT).
- **FR-021**: Dans le pack, chaque option de choix MUST être annoncée par son picto et un court
  audio (le libellé de l'option), et la fin de chaque branche MUST ramener au début de
  l'histoire ou au menu.
- **FR-022**: Le pack MUST porter le titre, une description et la couverture de l'histoire.
- **FR-023**: Un pack MUST contenir une seule histoire ; chaque histoire exportée apparaît comme
  une entrée distincte sur la Lunii. Le regroupement de plusieurs histoires dans un même pack
  est hors périmètre de cette version.

**Projets, réglages et services**

- **FR-024**: Le système MUST sauvegarder automatiquement chaque projet et permettre de le
  reprendre à l'étape atteinte, de le dupliquer et de le supprimer (avec confirmation).
- **FR-025**: Le système MUST offrir un écran de réglages pour saisir les clés des services
  externes (texte, voix, images), les tester, et MUST NOT les afficher en clair une fois
  enregistrées.
- **FR-026**: Le système MUST déclencher un appel à un service externe payant uniquement sur
  action explicite du créateur, et indiquer quand une action en déclenche un.
- **FR-027**: Le système MUST afficher en français, sans perte du travail en cours, toute erreur
  d'un service externe (clé invalide, quota, réseau) et permettre de réessayer.
- **FR-028**: L'interface MUST être entièrement en français et les contenus générés MUST être en
  français.

### Key Entities *(include if feature involves data)*

- **Projet d'histoire** : une histoire en cours ou terminée ; titre, indications initiales, âge
  de l'auditeur, étape du parcours atteinte, style visuel, dates.
- **Scénario** : une des propositions ; titre, résumé, personnages, idée des choix ; un seul
  est retenu par projet.
- **Personnage** : prénom, âge, description, rôle ; source de voix attribuée. Le narrateur est
  un personnage particulier.
- **Étape** : un passage de l'histoire ; suite ordonnée de répliques (narration ou
  personnage) ; audio assemblé ; peut être suivie d'un point de choix, d'une autre étape, ou
  être une fin.
- **Réplique** : texte, intervenant, audio associé (enregistré ou généré) et état (à jour,
  obsolète, manquant).
- **Point de choix / Option** : question posée à l'enfant ; chaque option a un libellé, un
  audio d'annonce, un picto et une étape cible.
- **Picto** : image associée à la couverture ou à une option ; origine (générée, importée,
  par défaut).
- **Pack exporté** : archive produite à partir d'un projet complet, à une date donnée.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un créateur obtient une histoire interactive complète, en voix de synthèse et
  exportée, en moins de 20 minutes à partir de ses indications.
- **SC-002**: 100 % des packs exportés s'importent sans erreur ni retouche dans STUdio.
- **SC-003**: Dans 100 % des packs exportés, toutes les branches sont parcourables jusqu'à une
  fin et reviennent au début ou au menu, sans blocage sur la Lunii.
- **SC-004**: Les 4 scénarios proposés sont jugés distincts par le créateur (intrigues
  différentes) dans au moins 9 cas sur 10.
- **SC-005**: Aucun contenu inadapté aux enfants n'apparaît sur un panel de tests d'au moins
  20 demandes variées, y compris des demandes volontairement limites.
- **SC-006**: Un créateur non technicien termine sa première histoire sans aide extérieure.
- **SC-007**: Après fermeture et réouverture de l'application, 100 % du travail déjà réalisé
  (textes, audios, images) est retrouvé.
- **SC-008**: L'enregistrement de toutes les répliques d'un personnage depuis le script se fait
  sans quitter l'écran d'enregistrement ni manipuler de fichiers.

## Assumptions

- Utilisateur unique, sur son propre ordinateur ; pas de comptes ni de partage en ligne.
- La taille de l'histoire est réglable finement (voir FR-029). Valeurs par défaut : 2 points de
  choix sur un même parcours, 2 options par choix, environ 10 minutes d'écoute par parcours.
  Limites hautes : 4 points de choix par parcours, 3 options par choix, 20 minutes par parcours.
- Le texte de l'histoire est généré par Claude (API Anthropic) ; le créateur dispose de sa
  propre clé.
- Les voix ElevenLabs et la génération d'images nécessitent les clés correspondantes ; sans
  elles, l'enregistrement personnel, la voix de synthèse locale et les pictos par défaut ou
  importés restent disponibles.
- Le fournisseur de génération d'images sera choisi lors de la planification, sur le critère
  du rendu de pictos illustrés lisibles en petit format.
- Le transfert du pack sur la Lunii est effectué par le créateur avec un outil tiers (STUdio,
  Lunii QT) ; l'application n'écrit pas directement sur la Lunii.
- Le format cible est le format de pack STUdio en vigueur ; l'écran Lunii affiche des images
  de petite taille (320×240).
- Le créateur dispose d'un micro fonctionnel pour l'enregistrement personnel.
- Hors périmètre de cette version : modification avancée de l'audio (montage, musique de fond,
  effets sonores), édition graphique des images, langues autres que le français.
