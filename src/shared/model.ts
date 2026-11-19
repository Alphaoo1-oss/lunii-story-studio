import { z } from "zod";

// Schémas du modèle (specs/001-lunii-story-creator/data-model.md), partagés serveur/interface.

export const PROJECT_STAGES = ["brief", "scenarios", "story", "voices", "pictos", "export"] as const;
export const ProjectStage = z.enum(PROJECT_STAGES);
export type ProjectStage = z.infer<typeof ProjectStage>;

export const SizeSettings = z.object({
  choicesPerPath: z.number().int().min(1).max(4).default(2),
  optionsPerChoice: z.number().int().min(2).max(3).default(2),
  allowMerging: z.boolean().default(true),
  minutesPerPath: z.number().int().min(5).max(20).default(10),
});
export type SizeSettings = z.infer<typeof SizeSettings>;
export const DEFAULT_SIZE_SETTINGS: SizeSettings = SizeSettings.parse({});

export const Scenario = z.object({
  id: z.string(),
  title: z.string().min(1),
  summary: z.string().min(1),
  characters: z.array(
    z.object({
      name: z.string().min(1),
      age: z.number().int().nullable().optional(),
      description: z.string(),
    }),
  ),
  choiceIdeas: z.array(z.string()),
});
export type Scenario = z.infer<typeof Scenario>;

export const VoiceSource = z.enum(["recorded", "voicebox", "piper", "elevenlabs"]);
export type VoiceSource = z.infer<typeof VoiceSource>;

export const VoiceAssignment = z
  .object({
    source: VoiceSource,
    voiceId: z.string().nullable(),
    settings: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((v) => v.source === "recorded" || !!v.voiceId, {
    message: "Une voix doit être choisie pour la voix locale ou ElevenLabs.",
    path: ["voiceId"],
  });
export type VoiceAssignment = z.infer<typeof VoiceAssignment>;

export const Character = z.object({
  id: z.string(),
  name: z.string().min(1),
  isNarrator: z.boolean(),
  age: z.number().int().nullable(),
  description: z.string(),
  // Apparence physique, reprise de la fiche famille (la description garde le déguisement et le caractère).
  appearance: z.string().max(1000).default(""),
  voice: VoiceAssignment.nullable().default(null),
});
export type Character = z.infer<typeof Character>;

// Fiche famille : les vraies personnes, reprises dans chaque nouvelle histoire.
export const FamilyMember = z.object({
  id: z.string(),
  name: z.string().min(1).max(40),
  // Autres noms sous lesquels la personne apparaît dans les histoires (« Maman », « Mamie »…).
  aliases: z.array(z.string().min(1).max(40)).default([]),
  appearance: z.string().max(1000).default(""),
  voice: VoiceAssignment.nullable().default(null),
  // Vit dans la maison de l'enfant (les histoires la placent alors chez lui).
  livesAtHome: z.boolean().default(false),
});
export type FamilyMember = z.infer<typeof FamilyMember>;

export const Family = z.object({ members: z.array(FamilyMember).default([]) });
export type Family = z.infer<typeof Family>;

export const AudioClip = z.object({
  file: z.string(),
  source: z.enum(["recorded", "voicebox", "piper", "elevenlabs", "assembled"]),
  durationSec: z.number().nonnegative(),
  peakDb: z.number().nullable().default(null),
  silent: z.boolean().default(false),
  clipped: z.boolean().default(false),
  // Empreinte de ce dont l'audio est issu (texte, voix, répliques assemblées) : sert à détecter
  // un audio obsolète.
  sourceHash: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type AudioClip = z.infer<typeof AudioClip>;

export const Picto = z.object({
  file: z.string(),
  origin: z.enum(["generated", "imported", "default"]),
  style: z.string().nullable(),
  promptHash: z.string().nullable(),
});
export type Picto = z.infer<typeof Picto>;

export const Line = z.object({
  id: z.string(),
  characterId: z.string(),
  text: z.string().min(1).max(1000),
  // Empreinte du texte (et de la voix) au moment où l'audio a été produit.
  textHash: z.string().nullable().default(null),
  audio: AudioClip.nullable().default(null),
});
export type Line = z.infer<typeof Line>;

export const SegmentNext = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), choiceId: z.string() }),
  z.object({ kind: z.literal("segment"), segmentId: z.string() }),
  z.object({ kind: z.literal("end") }),
]);
export type SegmentNext = z.infer<typeof SegmentNext>;

export const Segment = z.object({
  id: z.string(),
  title: z.string(),
  lines: z.array(Line).min(1),
  next: SegmentNext,
  audio: AudioClip.nullable().default(null),
});
export type Segment = z.infer<typeof Segment>;

export const ChoiceOption = z.object({
  id: z.string(),
  label: z.string().min(1).max(60),
  targetSegmentId: z.string(),
  announceAudio: AudioClip.nullable().default(null),
  picto: Picto.nullable().default(null),
});
export type ChoiceOption = z.infer<typeof ChoiceOption>;

export const Choice = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(ChoiceOption).min(2).max(3),
});
export type Choice = z.infer<typeof Choice>;

export const StoryGraph = z.object({
  startSegmentId: z.string(),
  segments: z.array(Segment),
  choices: z.array(Choice),
});
export type StoryGraph = z.infer<typeof StoryGraph>;

export const ExportRecord = z.object({
  file: z.string(),
  createdAt: z.string(),
  stats: z.object({
    segments: z.number().int(),
    choices: z.number().int(),
    endings: z.number().int(),
    totalMinutes: z.number(),
  }),
});
export type ExportRecord = z.infer<typeof ExportRecord>;

export const Project = z
  .object({
    id: z.string(),
    title: z.string().min(1).max(80),
    description: z.string().max(300).default(""),
    brief: z.string().max(4000).default(""),
    listenerAge: z.number().int().min(2).max(10).default(5),
    sizeSettings: SizeSettings.default(DEFAULT_SIZE_SETTINGS),
    stage: ProjectStage.default("brief"),
    scenarioBatches: z.array(z.array(Scenario)).default([]),
    // Ce que Claude a dû supposer faute de précision dans les indications (prénoms, âge…).
    assumptions: z.array(z.string()).default([]),
    selectedScenarioId: z.string().nullable().default(null),
    characters: z.array(Character).default([]),
    graph: StoryGraph.nullable().default(null),
    visualStyle: z.string().nullable().default(null),
    coverPicto: Picto.nullable().default(null),
    // Annonce du titre sur la couverture (lue par le narrateur).
    titleAudio: AudioClip.nullable().default(null),
    exports: z.array(ExportRecord).default([]),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .refine((p) => p.characters.length === 0 || p.characters.filter((c) => c.isNarrator).length === 1, {
    message: "Un projet doit avoir exactement un narrateur.",
    path: ["characters"],
  })
  .refine((p) => new Set(p.characters.map((c) => c.name)).size === p.characters.length, {
    message: "Chaque personnage doit avoir un nom unique.",
    path: ["characters"],
  });
export type Project = z.infer<typeof Project>;

const ApiKey = z.string().min(1).nullable().default(null);

export const TextProvider = z.enum(["subscription", "api"]);
export type TextProvider = z.infer<typeof TextProvider>;

export const Settings = z.object({
  anthropicApiKey: ApiKey,
  elevenLabsApiKey: ApiKey,
  geminiApiKey: ApiKey,
  // Accès à Claude pour écrire les histoires : clé API (défaut) ou abonnement personnel, si autorisé sur ce poste.
  textProvider: TextProvider.default("api"),
  textModel: z.string().min(1).default("claude-opus-5-5"),
  imageModel: z.string().min(1).default("gemini-nano-banana-2.1"),
  port: z.number().int().min(1024).max(65535).default(5174),
});
export type Settings = z.infer<typeof Settings>;

export const API_KEY_FIELDS = ["anthropicApiKey", "elevenLabsApiKey", "geminiApiKey"] as const;
export type ApiKeyField = (typeof API_KEY_FIELDS)[number];
