import type { PictoStyle } from "@shared/api";

// Styles communs proposés pour les pictos d'une histoire, avec leur fragment de prompt.
export const PICTO_STYLES: (PictoStyle & { prompt: string })[] = [
  {
    id: "pixel-art",
    label: "Pixel art rétro",
    description: "Icône 8 bits blanche et grise sur fond noir, dans un cadre arrondi.",
    prompt:
      "retro 8-bit pixel art icon for a children's storybox, monochrome: white and grayscale only on a solid black background, " +
      "the icon enclosed in a white rounded-square pixel border, chunky visible pixels, simple, high-contrast, charming",
  },
  {
    id: "aquarelle",
    label: "Aquarelle douce",
    description: "Couleurs pastel, contours légers, ambiance tendre.",
    prompt: "soft watercolor children's book illustration, gentle pastel colors, light ink outlines, paper texture",
  },
  {
    id: "papier-decoupe",
    label: "Papier découpé",
    description: "Formes simples en papier coloré superposé.",
    prompt: "cut paper collage illustration, layered colored paper shapes, simple bold forms, subtle drop shadows",
  },
  {
    id: "dessin-anime",
    label: "Dessin animé",
    description: "Traits ronds et couleurs vives, comme un dessin animé.",
    prompt: "cheerful 2D cartoon illustration, rounded shapes, thick clean outlines, bright saturated colors, flat shading",
  },
  {
    id: "crayons",
    label: "Crayons de couleur",
    description: "Aspect fait main, au crayon de couleur.",
    prompt: "colored pencil drawing for a picture book, visible hand-drawn strokes, warm colors, white paper background",
  },
  {
    id: "pate-a-modeler",
    label: "Pâte à modeler",
    description: "Personnages tout ronds en pâte à modeler.",
    prompt: "claymation style 3D illustration, characters made of modeling clay, soft studio lighting, rounded chunky shapes",
  },
];

export const DEFAULT_STYLE_ID = "pixel-art";

export function styleById(id: string) {
  return PICTO_STYLES.find((s) => s.id === id);
}
