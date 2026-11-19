// Voix de synthèse (research.md R6), injectables : Piper (local) et ElevenLabs, doublures en test.

export type VoiceInfo = {
  id: string;
  name: string;
  description?: string;
  // Piper : la voix est-elle déjà téléchargée sur le poste ?
  installed?: boolean;
};

export type SynthesisItem = {
  text: string;
  // Fichier audio à produire (tout format lisible par ffmpeg) ; l'appelant le convertit.
  output: string;
  // Une nouvelle prise est demandée : ne pas réutiliser un audio déjà généré pour ce texte.
  fresh?: boolean;
};

export interface TtsProvider {
  // Voix locales : téléchargement à la demande (sans effet pour un service en ligne).
  install?(voiceId: string): Promise<void>;
  listVoices(): Promise<VoiceInfo[]>;
  // Synthétise une série de textes avec la même voix. Rejette avec une AppError en français ;
  // les fichiers déjà produits avant l'erreur restent utilisables.
  synthesize(items: SynthesisItem[], voiceId: string, settings: Record<string, unknown>): Promise<void>;
}
