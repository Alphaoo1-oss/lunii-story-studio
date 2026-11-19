import { describe, expect, it } from "vitest";
import type { SetupStatus } from "@shared/api";
import { buildApp } from "../../src/server/app";
import { AudioService } from "../../src/server/audio/generate";
import { PictoService } from "../../src/server/images/pictos";
import { FamilyStore } from "../../src/server/storage/family";
import { ProjectStore } from "../../src/server/storage/projects";
import { SettingsStore } from "../../src/server/storage/settings";
import type { TtsProvider } from "../../src/server/tts/provider";
import { FakeTextGenerator } from "../fixtures/ai/fake";
import { FakeImages } from "../fixtures/images";
import { FakeTts } from "../fixtures/tts";
import { noLunii, useTempDir } from "../helpers";

const tempDir = useTempDir();

class OfflineTts extends FakeTts implements TtsProvider {
  override async listVoices(): Promise<never> {
    throw new Error("hors ligne");
  }
}

async function setup(claudeOk: boolean, voicebox: FakeTts) {
  const dir = await tempDir();
  const projects = new ProjectStore(dir);
  const piper = new OfflineTts();
  const tester = async () => ({ ok: claudeOk, message: claudeOk ? "Connecté." : "Pas encore connecté." });
  const voices = { voicebox, piper, elevenlabs: new FakeTts() };
  const app = await buildApp({
    family: new FamilyStore(dir),
    projects,
    settings: new SettingsStore(dir, {}),
    testers: { subscription: tester, anthropic: tester, elevenlabs: tester, gemini: tester },
    text: new FakeTextGenerator([]),
    voices,
    audio: new AudioService(projects, voices),
    pictos: new PictoService(projects, new FakeImages()),
    lunii: noLunii(dir),
    dataDir: dir,
  });
  return { app };
}

const stateOf = (status: SetupStatus, id: string) => status.steps.find((s) => s.id === id)?.state;

describe("premiers pas", () => {
  it("signale ce qui manque sur une installation neuve", async () => {
    const { app } = await setup(false, new OfflineTts());
    const status = (await app.inject({ method: "GET", url: "/api/setup" })).json() as SetupStatus;
    expect(status.ready).toBe(false);
    expect(stateOf(status, "claude")).toBe("todo");
    expect(stateOf(status, "voices")).toBe("optional");
    expect(stateOf(status, "pictos")).toBe("optional");
    expect(stateOf(status, "family")).toBe("optional");
    expect(stateOf(status, "story")).toBe("todo");
  });

  it("indique que Claude et Voicebox sont prêts", async () => {
    const { app } = await setup(true, new FakeTts());
    await app.inject({ method: "POST", url: "/api/projects" });
    const status = (await app.inject({ method: "GET", url: "/api/setup" })).json() as SetupStatus;
    expect(stateOf(status, "claude")).toBe("ok");
    expect(status.steps.find((s) => s.id === "voices")!.message).toContain("Voicebox (1 profil)");
    expect(stateOf(status, "story")).toBe("ok");
    expect(status.ready).toBe(true);
  });
});
