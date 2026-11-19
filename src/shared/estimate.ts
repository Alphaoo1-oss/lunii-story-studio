import type { SizeEstimate } from "./api";
import type { SizeSettings } from "./model";

// Estimation de la taille d'une histoire à partir des réglages (FR-029, data-model.md).
// Partagée : le serveur la renvoie, l'interface la recalcule en direct.

const MAX_SEGMENTS = 40;
const MAX_TOTAL_MINUTES = 60;

export function estimateSize(size: SizeSettings): SizeEstimate {
  const k = size.choicesPerPath;
  const n = size.optionsPerChoice;
  let segments: number;
  let endings: number;
  if (size.allowMerging) {
    // Les branches d'un choix se rejoignent au choix suivant : seules les dernières sont des fins.
    segments = 1 + k * n;
    endings = n;
  } else {
    // Arbre complet : 1 + n + n² + … + n^k.
    segments = Array.from({ length: k + 1 }, (_, i) => n ** i).reduce((a, b) => a + b, 0);
    endings = n ** k;
  }
  // Un parcours traverse k + 1 segments.
  const minutesPerSegment = size.minutesPerPath / (k + 1);
  const totalMinutes = Math.round(segments * minutesPerSegment * 10) / 10;

  const warnings: string[] = [];
  if (segments > MAX_SEGMENTS) {
    warnings.push(
      `Ces réglages donnent ${segments} étapes et ${endings} fins à écrire, enregistrer ou générer.` +
        (size.allowMerging ? "" : " Faire se rejoindre les branches réduirait beaucoup ce nombre."),
    );
  }
  if (totalMinutes > MAX_TOTAL_MINUTES) {
    warnings.push(`Il y aura environ ${Math.round(totalMinutes)} minutes d'audio à produire au total.`);
  }
  return { segments, endings, minutesPerSegment: Math.round(minutesPerSegment * 100) / 100, totalMinutes, warnings };
}
