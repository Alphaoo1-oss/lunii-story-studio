// Génération d'images (research.md R9), injectable : Gemini Nano Banana, doublure en test.

export type ImageRequest = {
  prompt: string;
  // Images de référence (la couverture, par exemple) pour garder style et personnages constants.
  references?: Buffer[];
};

export interface ImageProvider {
  // Renvoie l'image produite (PNG ou JPEG) ; rejette avec une AppError en français.
  generate(request: ImageRequest): Promise<Buffer>;
}
