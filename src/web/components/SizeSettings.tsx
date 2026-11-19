import { estimateSize } from "@shared/estimate";
import type { SizeSettings as Size } from "@shared/model";

// Réglages de taille de l'histoire avec estimation en direct (FR-029).
export function SizeSettings({ value, onChange, disabled }: { value: Size; onChange: (v: Size) => void; disabled?: boolean }) {
  const estimate = estimateSize(value);
  const set = <K extends keyof Size>(key: K, v: Size[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="size-settings">
      <label>
        Points de choix sur un parcours : <strong>{value.choicesPerPath}</strong>
        <input type="range" min={1} max={4} value={value.choicesPerPath} disabled={disabled}
          onChange={(e) => set("choicesPerPath", Number(e.target.value))} />
      </label>
      <fieldset disabled={disabled}>
        <legend>Options par choix</legend>
        {[2, 3].map((n) => (
          <label key={n} className="radio">
            <input type="radio" name="options" checked={value.optionsPerChoice === n} onChange={() => set("optionsPerChoice", n)} />
            {n} options
          </label>
        ))}
      </fieldset>
      <label className="radio">
        <input type="checkbox" checked={value.allowMerging} disabled={disabled}
          onChange={(e) => set("allowMerging", e.target.checked)} />
        Les branches se rejoignent (histoire plus courte à produire)
      </label>
      <label>
        Durée d'écoute d'un parcours : <strong>{value.minutesPerPath} min</strong>
        <input type="range" min={5} max={20} value={value.minutesPerPath} disabled={disabled}
          onChange={(e) => set("minutesPerPath", Number(e.target.value))} />
      </label>

      <div className="stats">
        <div className="stat"><strong>{estimate.segments}</strong>étapes</div>
        <div className="stat"><strong>{estimate.endings}</strong>fins</div>
        <div className="stat">
          <strong>{estimate.totalMinutes.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} min</strong>d'audio au total
        </div>
      </div>
      {estimate.warnings.map((w) => (
        <p key={w} className="warn">{w}</p>
      ))}
    </div>
  );
}
