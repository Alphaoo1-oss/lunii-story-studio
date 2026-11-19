import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";

// Format des images du pack (research.md R2) : PNG 320×240.
export const LUNII_WIDTH = 320;
export const LUNII_HEIGHT = 240;

export async function toLuniiPng(input: string | Buffer, output: string): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  await sharp(input)
    .rotate() // respecte l'orientation EXIF des photos importées
    .resize(LUNII_WIDTH, LUNII_HEIGHT, { fit: "cover", position: "centre" })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(output);
}

const DEFAULT_COLORS = ["#F4A259", "#5B8E7D", "#8CB369", "#BC4B51", "#6A8EAE", "#9B72AA"];

export function defaultPictoColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]!;
}

// Picto par défaut (FR-018) : le libellé centré sur un fond uni.
export async function defaultPicto(label: string, color: string, output: string): Promise<void> {
  const lines = wrap(label, 16).slice(0, 3);
  const fontSize = lines.length > 2 ? 30 : 36;
  const lineHeight = fontSize * 1.2;
  const firstY = LUNII_HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2;
  const text = lines
    .map((line, i) => `<text x="50%" y="${firstY + i * lineHeight}" dominant-baseline="middle" text-anchor="middle">${escapeXml(line)}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LUNII_WIDTH}" height="${LUNII_HEIGHT}">
    <rect width="100%" height="100%" rx="0" fill="${color}"/>
    <g font-family="Verdana, DejaVu Sans, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${text}</g>
  </svg>`;
  await mkdir(dirname(output), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(output);
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/)) {
    if (current && (current + " " + word).length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}
