import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { concat, levels, probe, toLuniiMp3 } from "../../src/server/audio/ffmpeg";
import { silence, tone } from "../fixtures/media";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

describe("ffmpeg", () => {
  it("convertit au format du pack : MP3 mono 44 100 Hz", async () => {
    const dir = await tempDir();
    await tone(join(dir, "in.wav"), { stereo: true, seconds: 1 });
    const info = await toLuniiMp3(join(dir, "in.wav"), join(dir, "out.mp3"));
    expect(info).toMatchObject({ codec: "mp3", sampleRate: 44100, channels: 1 });
    expect(info.durationSec).toBeGreaterThan(0.9);
    expect(info.durationSec).toBeLessThan(1.2);
  });

  it("normalise la crête près de 0 dB", async () => {
    const dir = await tempDir();
    await tone(join(dir, "quiet.wav"), { volume: 0.05 });
    await toLuniiMp3(join(dir, "quiet.wav"), join(dir, "out.mp3"));
    const { peakDb } = await levels(join(dir, "out.mp3"));
    expect(peakDb).toBeGreaterThan(-2);
    expect(peakDb).toBeLessThanOrEqual(0.1);
  });

  it("enchaîne les fichiers dans l'ordre avec un silence entre eux", async () => {
    const dir = await tempDir();
    await tone(join(dir, "a.wav"), { seconds: 0.5 });
    await tone(join(dir, "b.wav"), { seconds: 1, frequency: 880 });
    const info = await concat([join(dir, "a.wav"), join(dir, "b.wav")], 300, join(dir, "ab.mp3"));
    expect(info.sampleRate).toBe(44100);
    expect(info.channels).toBe(1);
    expect(info.durationSec).toBeGreaterThan(1.7);
    expect(info.durationSec).toBeLessThan(2.0);
    expect((await probe(join(dir, "ab.mp3"))).codec).toBe("mp3");
  });

  it("détecte une prise silencieuse ou saturée", async () => {
    const dir = await tempDir();
    await silence(join(dir, "silent.wav"));
    // La sinusoïde de ffmpeg est à -18 dB : un gain de 20 la fait saturer.
    await tone(join(dir, "loud.wav"), { volume: 20 });
    await tone(join(dir, "ok.wav"), { volume: 0.3 });
    expect((await levels(join(dir, "silent.wav"))).silent).toBe(true);
    expect((await levels(join(dir, "loud.wav"))).clipped).toBe(true);
    expect(await levels(join(dir, "ok.wav"))).toMatchObject({ silent: false, clipped: false });
  });
});
