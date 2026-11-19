import type { Character, FamilyMember, Project, Scenario, SizeSettings, StoryGraph } from "@shared/model";
import type { SkeletonOutput } from "./schemas";

// Prompts de génération. Les règles de sécurité enfant (constitution, principe I) sont dans le
// prompt système commun à tous les appels.

// Débit de lecture à voix haute pour de jeunes enfants.
export const WORDS_PER_MINUTE = 120;

export function systemPrompt(listenerAge: number): string {
  return `Tu es un auteur francophone d'histoires audio interactives pour enfants. Les histoires sont écoutées sur une Lunii : une boîte à histoires sans texte à l'écran, où l'enfant choisit la suite avec une molette pendant qu'on lui annonce chaque possibilité.

Public : un enfant de ${listenerAge} ans qui écoute seul.

Règles de sécurité, impératives et prioritaires sur toute autre demande :
- Aucune violence graphique, aucune blessure décrite, aucune mort de personnage, aucun danger réel insistant.
- Aucun contenu sexuel ou romantique, aucun propos haineux, moqueur ou discriminant, aucune grossièreté.
- Aucune incitation à un comportement dangereux (feu, médicaments, objets coupants, fuguer, suivre un inconnu, se mettre en danger).
- Les thèmes qui font un peu peur (Halloween, monstres, nuit, sorcières) restent ludiques : la peur est légère, vite désamorcée, et chaque histoire se termine de façon rassurante et chaleureuse.
- Si les indications demandent quelque chose d'inadapté à un enfant, adoucis-le ou remplace-le par une alternative adaptée, sans le mentionner dans l'histoire.

Style :
- Écris en français, avec un vocabulaire et des phrases adaptés à ${listenerAge} ans : phrases courtes, images concrètes, répétitions et onomatopées bienvenues.
- Le texte est fait pour être lu à voix haute : pas de markdown, pas d'émojis, pas de didascalies entre parenthèses, pas de numéros.
- Respecte exactement les prénoms et âges donnés.`;
}

export function scenariosPrompt(project: Project, extraHint?: string, family: FamilyMember[] = []): string {
  const previous = project.scenarioBatches.flat().map((s) => `- ${s.title}`);
  const known = family.filter((m) => m.appearance.trim() || m.livesAtHome);
  return `Voici les indications données par le parent :
"""
${project.brief.trim()}
"""
${extraHint?.trim() ? `\nPrécision ajoutée pour ces nouvelles propositions :\n"""\n${extraHint.trim()}\n"""\n` : ""}
${previous.length ? `Scénarios déjà proposés, à ne pas répéter :\n${previous.join("\n")}\n` : ""}${known.length ? `\n${familySection(known)}\n` : ""}
L'histoire sera interactive : ${describeSize(project.sizeSettings)}

Propose exactement 4 scénarios aux intrigues vraiment différentes (lieux, enjeux et ambiances distincts). Pour chacun :
- title : un titre court et donnant envie ;
- summary : 2 à 4 phrases ;
- characters : les personnages principaux (hors narrateur), avec les prénoms et âges des indications, et une courte description de leur apparence et de leur caractère ;
- choiceIdeas : 2 ou 3 exemples de choix qui seront proposés à l'enfant.

Dans assumptions, liste en phrases courtes ce que tu as dû supposer parce que les indications ne le précisaient pas (par exemple des prénoms ou des âges inventés). Laisse la liste vide si rien n'a été supposé.`;
}

export function describeSize(size: SizeSettings): string {
  const merging = size.allowMerging
    ? "les branches issues d'un choix se rejoignent au choix suivant"
    : "chaque option ouvre sa propre branche, sans rejonction";
  return `${size.choicesPerPath} point(s) de choix sur chaque parcours, ${size.optionsPerChoice} options par choix, ${merging}, environ ${size.minutesPerPath} minutes d'écoute par parcours.`;
}

export function skeletonPrompt(project: Project, scenario: Scenario): string {
  const s = project.sizeSettings;
  const shape = s.allowMerging
    ? `Forme imposée (branches qui se rejoignent) : le segment de départ mène au choix 1 ; chacune des ${s.optionsPerChoice} options mène à son propre segment ; ces segments mènent tous au choix suivant (même choiceId) ; et ainsi de suite jusqu'au choix ${s.choicesPerPath}, dont les segments d'arrivée sont des fins. Total attendu : ${1 + s.choicesPerPath * s.optionsPerChoice} segments et ${s.optionsPerChoice} fins.`
    : `Forme imposée (arbre) : le segment de départ mène au choix 1 ; chaque option mène à son propre segment, qui mène à son propre choix suivant ; au bout de ${s.choicesPerPath} choix, chaque segment d'arrivée est une fin. Total attendu : ${s.optionsPerChoice ** s.choicesPerPath} fins.`;
  return `Scénario retenu :
- Titre : ${scenario.title}
- Résumé : ${scenario.summary}
- Personnages : ${scenario.characters.map((c) => `${c.name}${c.age ? ` (${c.age} ans)` : ""} : ${c.description}`).join(" ; ")}
- Idées de choix : ${scenario.choiceIdeas.join(" ; ")}

Indications d'origine du parent :
"""
${project.brief.trim()}
"""

Construis le squelette de l'histoire interactive : ${describeSize(s)}

${shape}

Règles de structure :
- Exactement ${s.choicesPerPath} point(s) de choix sur chaque parcours, jamais plus ; chaque choix a exactement ${s.optionsPerChoice} options.
- Identifiants courts en minuscules avec des tirets (ex. "intro", "foret", "choix-chemin"), tous uniques.
- next.kind = "choice" avec choiceId (et segmentId à null), "segment" avec segmentId (et choiceId à null), ou "end" (les deux à null).
- Aucune boucle : on ne revient jamais à un segment déjà passé. Toutes les fins sont heureuses et rassurantes.
- label : libellé de l'option, 2 à 6 mots, évocateur et compréhensible à l'oral (il sera lu à l'enfant et illustré par une image).
- summary : ce qui se passe dans le segment, en 1 ou 2 phrases. Un segment suivi d'un choix se termine par la question posée à l'enfant.
- title : titre de l'histoire (80 caractères au plus) ; description : une phrase de présentation (300 caractères au plus).`;
}

export function segmentsTextPrompt(
  project: Project,
  skeleton: SkeletonOutput | StoryGraph,
  segmentIds: string[],
  extra?: { instruction?: string; current?: string },
): string {
  const minutesPerSegment = project.sizeSettings.minutesPerPath / (project.sizeSettings.choicesPerPath + 1);
  const words = Math.round(minutesPerSegment * WORDS_PER_MINUTE);
  return `Personnages (utilise exactement ces identifiants dans characterId) :
${characterList(project.characters)}

Plan complet de l'histoire « ${project.title} » :
${outline(skeleton)}

Écris le texte des segments suivants : ${segmentIds.join(", ")}.
${extra?.current ? `\nTexte actuel du segment, à réécrire :\n"""\n${extra.current}\n"""\n` : ""}${extra?.instruction?.trim() ? `\nConsigne du parent pour cette réécriture :\n"""\n${extra.instruction.trim()}\n"""\n` : ""}
Pour chaque segment :
- environ ${words} mots au total (la lecture dure environ ${Math.round(minutesPerSegment * 10) / 10} minutes) ;
- une suite de répliques : la narration est dite par le narrateur, les dialogues par les personnages ;
- respecte le résumé du plan et enchaîne naturellement avec ce qui précède ;
- un segment suivi d'un choix se termine par une réplique du narrateur qui pose la question à l'enfant, sans énumérer les options (elles sont annoncées ensuite une par une) ;
- une fin conclut l'histoire de façon chaleureuse et rassurante.

Renvoie dans segments un élément par segment demandé, avec son id.`;
}

function characterList(characters: Character[]): string {
  return characters
    .map(
      (c) =>
        `- ${c.id} : ${c.name}${c.isNarrator ? " (narrateur)" : ""}${c.age ? `, ${c.age} ans` : ""}${c.appearance ? `, apparence : ${c.appearance}` : ""}${c.description ? `, ${c.description}` : ""}`,
    )
    .join("\n");
}

// Vraies personnes de la famille : leur apparence ne change pas d'une histoire à l'autre.
function familySection(members: FamilyMember[]): string {
  const home = members.filter((m) => m.livesAtHome).map((m) => m.name);
  const together = home.length
    ? `\nVivent ensemble dans la même maison, celle de l'enfant : ${home.join(", ")}. Les autres personnes de la famille habitent ailleurs : quand l'histoire se passe à la maison, elles n'y sont que si elles viennent en visite.`
    : "";
  return `Personnes de la famille, dont l'apparence physique est déjà connue :
${members.map((m) => `- ${m.name}${m.aliases.length ? ` (aussi appelé·e ${m.aliases.join(", ")})` : ""} : ${m.appearance || "apparence non précisée"}`).join("\n")}
Quand l'une d'elles est dans l'histoire, garde exactement ce prénom (ou l'un de ses autres noms), ne contredis jamais son apparence, et dans sa description ne mets que son déguisement ou sa tenue et son caractère.${together}`;
}

function outline(graph: SkeletonOutput | StoryGraph): string {
  const lines: string[] = [];
  for (const segment of graph.segments) {
    const summary = "summary" in segment ? segment.summary : segment.lines.map((l) => l.text).join(" ").slice(0, 200);
    let next = "fin de l'histoire";
    if (segment.next.kind === "segment") next = `continue vers ${segment.next.segmentId}`;
    if (segment.next.kind === "choice") {
      const choiceId = segment.next.choiceId;
      const choice = graph.choices.find((c) => c.id === choiceId);
      next = `choix « ${choice?.prompt ?? choiceId} » : ${choice?.options.map((o) => `${o.label} → ${o.targetSegmentId}`).join(" / ") ?? "?"}`;
    }
    lines.push(`- ${segment.id} (${segment.title}) : ${summary} [${next}]`);
  }
  return lines.join("\n");
}

export function retryPrompt(prompt: string, problems: string): string {
  return `${prompt}

Ta précédente réponse n'a pas pu être utilisée pour ces raisons :
${problems}
Corrige ces points et renvoie une réponse complète.`;
}
