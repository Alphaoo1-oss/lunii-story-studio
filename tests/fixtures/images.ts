import sharp from "sharp";
import { AppError } from "../../src/server/errors";
import type { ImageProvider, ImageRequest } from "../../src/server/images/provider";

// Doublure de Gemini : une image 4:3 unie, et la trace des demandes reçues.
export class FakeImages implements ImageProvider {
  readonly requests: ImageRequest[] = [];
  constructor(private readonly failAfter = Infinity) {}

  async generate(request: ImageRequest): Promise<Buffer> {
    if (this.requests.length >= this.failAfter) throw new AppError("gemini_quota", "Le quota Gemini est atteint.", 429);
    this.requests.push(request);
    return sharp({ create: { width: 1024, height: 768, channels: 3, background: "#336699" } }).png().toBuffer();
  }
}
