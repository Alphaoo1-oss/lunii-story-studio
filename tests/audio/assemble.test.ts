import { describe, expect, it } from "vitest";
import { probe } from "../../src/server/audio/ffmpeg";
import { AudioService, LINE_GAP_MS } from "../../src/server/audio/generate";
import { ProjectStore } from "../../src/server/storage/projects";
import { segmentAudioState, segmentSourceHash } from "../../src/server/story/state";
import { createReferenceProject } from "../fixtures/media";
import { FakeTts } from "../fixtures/tts";
import { useTempDir } from "../helpers";

const tempDir = useTempDir();

describe("AudioService.assemble", () => {
  it("enchaîne les répliques de l'étape, quelle que soit leur source, au format du pack", async () => {
    const store = new ProjectStore(await tempDir());
    const project = await createReferenceProject(store);
    // On rend l'audio de l'étape d'introduction obsolète en remplaçant une prise enregistrée.
    await store.update(project.id, (p) => {
      const intro = p.graph!.segments[0]!;
      intro.lines[1]!.audio = { ...intro.lines[1]!.audio!, source: "recorded" };
      intro.audio = { ...intro.audio!, sourceHash: "ancien" };
    });
    const service = new AudioService(store, { voicebox: new FakeTts(), piper: new FakeTts(), elevenlabs: new FakeTts() });

    await service.assemble(project.id);

    const saved = await store.get(project.id);
    const intro = saved.graph!.segments[0]!;
    expect(segmentAudioState(intro, saved.characters)).toBe("ok");
    expect(intro.audio!.sourceHash).toBe(segmentSourceHash(intro));
    expect(intro.audio!.source).toBe("assembled");

    const info = await probe(store.file(project.id, intro.audio!.file));
    expect(info).toMatchObject({ codec: "mp3", sampleRate: 44100, channels: 1 });
    const parts = intro.lines.reduce((sum, l) => sum + l.audio!.durationSec, 0);
    const gaps = ((intro.lines.length - 1) * LINE_GAP_MS) / 1000;
    expect(info.durationSec).toBeGreaterThan(parts + gaps - 0.15);
    expect(info.durationSec).toBeLessThan(parts + gaps + 0.25);
  });

  it("n'assemble pas une étape dont une réplique manque", async () => {
    const store = new ProjectStore(await tempDir());
    const project = await createReferenceProject(store);
    await store.update(project.id, (p) => {
      const fete = p.graph!.segments.find((s) => s.id === "fete")!;
      fete.lines[1]!.audio = null;
      fete.audio = null;
    });
    await new AudioService(store, { voicebox: new FakeTts(), piper: new FakeTts(), elevenlabs: new FakeTts() }).assemble(project.id);
    const fete = (await store.get(project.id)).graph!.segments.find((s) => s.id === "fete")!;
    expect(fete.audio).toBeNull();
  });
});
