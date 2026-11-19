import type { LuniiStory, LuniiStoryOrigin, LuniiTrashItem, LuniiView } from "@shared/api";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/client";

const ORIGIN: Record<LuniiStoryOrigin, string> = {
  official: "Lunii",
  custom: "Perso",
  unknown: "Inconnue",
};

export function MyLunii() {
  const [view, setView] = useState<LuniiView | null>(null);
  const [sizes, setSizes] = useState<Record<string, number> | null>(null);
  const [trash, setTrash] = useState<LuniiTrashItem[]>([]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const next = await api.get<LuniiView>("/api/lunii");
      setView(next);
      setOrder(null);
      setTrash(await api.get<LuniiTrashItem[]>("/api/lunii/trash"));
      setSizes(null);
      // Le calcul des tailles lit tous les fichiers de la Lunii : il arrive après la liste.
      if (next.device) api.get<Record<string, number>>("/api/lunii/sizes").then(setSizes, () => {});
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(run: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await run();
      await load();
      setMessage({ ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <section className="page narrow card">{message ? <p className="error">{message.text}</p> : <p>Recherche de la Lunii…</p>}</section>;

  const device = view.device;
  const byUuid = new Map(view.stories.map((s) => [s.uuid, s]));
  const stories = (order ?? view.stories.map((s) => s.uuid)).map((u) => byUuid.get(u)!).filter(Boolean);

  function move(index: number, delta: number) {
    const next = stories.map((s) => s.uuid);
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    setOrder(next);
  }

  function remove(story: LuniiStory) {
    const name = story.title ?? `l'histoire ${story.folder}`;
    if (!window.confirm(`Retirer « ${name} » de la Lunii ?\n\nElle est d'abord copiée sur ce PC : vous pourrez la remettre depuis la corbeille.`)) return;
    void act(() => api.delete(`/api/lunii/stories/${story.uuid}`), `« ${name} » a été retirée de la Lunii et gardée dans la corbeille.`);
  }

  return (
    <section className="page">
      <div className="card">
        <div className="card-head">
          <h2>Ma Lunii</h2>
          <button className="ghost" disabled={busy} onClick={() => void load()}>
            Actualiser
          </button>
        </div>
        {!device ? (
          <p>Aucune Lunii détectée. Branchez-la en USB, attendez qu'elle apparaisse comme un lecteur, puis cliquez sur « Actualiser ».</p>
        ) : (
          <>
            <p>
              Lunii {device.generation} sur le lecteur <strong>{device.root}</strong>
              {device.firmware ? ` · micrologiciel du ${device.firmware.slice(0, 10)}` : ""} · {view.stories.length} histoire(s)
            </p>
            {device.freeBytes !== null && device.totalBytes !== null && (
              <div className="progress">
                <progress max={device.totalBytes} value={device.totalBytes - device.freeBytes} />
                <span className="muted">{formatBytes(device.freeBytes)} libres sur {formatBytes(device.totalBytes)}</span>
              </div>
            )}
            <p className="muted">Fermez Lunii QT avant de modifier la Lunii, pour que les deux applications ne l'écrivent pas en même temps.</p>
          </>
        )}
        {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
      </div>

      {device && (
        <div className="card">
          <div className="card-head">
            <h2>Histoires, dans l'ordre de la molette</h2>
            {order && (
              <span className="row">
                <button className="ghost" disabled={busy} onClick={() => setOrder(null)}>
                  Annuler
                </button>
                <button disabled={busy} onClick={() => void act(() => api.put("/api/lunii/order", { uuids: order }), "Nouvel ordre enregistré sur la Lunii.")}>
                  Enregistrer l'ordre
                </button>
              </span>
            )}
          </div>
          <ul className="lunii-list">
            {stories.map((story, i) => (
              <li key={story.uuid} className="lunii-item">
                {story.thumbnail ? (
                  <img className="lunii-thumb" src={`/api/lunii/thumbnails/${story.uuid}`} alt="" />
                ) : (
                  <div className="lunii-thumb placeholder">{(story.title ?? "?").slice(0, 1)}</div>
                )}
                <div className="lunii-info">
                  <strong>{story.title ?? `Histoire sans titre (${story.folder})`}</strong>
                  <span className="muted">
                    <span className={`badge${story.origin === "custom" ? " ok" : ""}`}>{ORIGIN[story.origin]}</span>{" "}
                    {story.missing ? "dossier absent de la Lunii" : sizes ? formatBytes(sizes[story.uuid] ?? 0) : "taille…"}
                  </span>
                </div>
                <div className="lunii-actions">
                  <button className="ghost" title="Monter" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button className="ghost" title="Descendre" disabled={busy || i === stories.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button className="ghost danger" disabled={busy || !!order} title={order ? "Enregistrez d'abord l'ordre" : undefined} onClick={() => remove(story)}>
                    Retirer
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {view.orphans.length > 0 && (
            <p className="muted">
              {view.orphans.length} dossier(s) sur la Lunii ne figurent pas dans sa liste d'histoires ({view.orphans.join(", ")}) : ce sont
              sans doute des restes d'anciennes suppressions. Ils sont laissés tels quels.
            </p>
          )}
        </div>
      )}

      {trash.length > 0 && (
        <div className="card">
          <h2>Corbeille (sur ce PC)</h2>
          <p className="muted">Les histoires retirées de la Lunii sont gardées ici et peuvent y être remises, en fin de molette.</p>
          <ul className="lunii-list">
            {trash.map((item) => (
              <li key={item.id} className="lunii-item">
                <div className="lunii-info">
                  <strong>{item.title ?? item.uuid}</strong>
                  <span className="muted">
                    Retirée le {new Date(item.deletedAt).toLocaleString("fr-FR")} · {formatBytes(item.sizeBytes)}
                  </span>
                </div>
                <div className="lunii-actions">
                  <button
                    className="ghost"
                    disabled={busy || !device}
                    onClick={() => void act(() => api.post(`/api/lunii/trash/${item.id}/restore`), `« ${item.title ?? item.uuid} » est de retour sur la Lunii.`)}
                  >
                    Remettre sur la Lunii
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} Go`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} Mo`;
}
