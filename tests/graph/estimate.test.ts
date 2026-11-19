import { DEFAULT_SIZE_SETTINGS } from "@shared/model";
import { describe, expect, it } from "vitest";
import { estimateSize } from "@shared/estimate";

const size = (s: Partial<typeof DEFAULT_SIZE_SETTINGS>) => ({ ...DEFAULT_SIZE_SETTINGS, ...s });

describe("estimateSize", () => {
  it("sans rejonction : arbre complet, fins = options ^ choix", () => {
    const e = estimateSize(size({ choicesPerPath: 2, optionsPerChoice: 3, allowMerging: false, minutesPerPath: 9 }));
    expect(e.endings).toBe(9);
    expect(e.segments).toBe(1 + 3 + 9);
    expect(e.minutesPerSegment).toBe(3);
    expect(e.totalMinutes).toBe(39);
  });

  it("avec rejonction : segments ≈ 1 + choix × options", () => {
    const e = estimateSize(size({ choicesPerPath: 3, optionsPerChoice: 3, allowMerging: true, minutesPerPath: 8 }));
    expect(e.segments).toBe(1 + 3 * 3);
    expect(e.endings).toBe(3);
    expect(e.minutesPerSegment).toBe(2);
    expect(e.totalMinutes).toBe(20);
    expect(e.warnings).toEqual([]);
  });

  it("valeurs par défaut : histoire courte et sans avertissement", () => {
    const e = estimateSize(DEFAULT_SIZE_SETTINGS);
    expect(e).toMatchObject({ segments: 5, endings: 2, warnings: [] });
  });

  it("avertit au-delà de 40 segments", () => {
    const e = estimateSize(size({ choicesPerPath: 4, optionsPerChoice: 3, allowMerging: false, minutesPerPath: 5 }));
    expect(e.segments).toBe(121);
    expect(e.warnings.join(" ")).toMatch(/121 étapes/);
    expect(e.warnings.join(" ")).toMatch(/rejoindre/);
  });

  it("avertit au-delà de 60 minutes au total", () => {
    const e = estimateSize(size({ choicesPerPath: 2, optionsPerChoice: 3, allowMerging: false, minutesPerPath: 20 }));
    expect(e.segments).toBe(13);
    expect(e.totalMinutes).toBeGreaterThan(60);
    expect(e.warnings.join(" ")).toMatch(/minutes/);
  });
});
