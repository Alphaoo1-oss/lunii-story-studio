import { useEffect, useRef, useState } from "react";
import { errorMessage } from "./client";

// Sauvegarde automatique après une pause de saisie (constitution, principe IV).
// Renvoie un libellé d'état à afficher.
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delayMs = 800): string {
  const [state, setState] = useState("");
  const serialized = JSON.stringify(value);
  const last = useRef(serialized);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (serialized === last.current) return;
    setState("Modifications non enregistrées…");
    const timer = setTimeout(async () => {
      try {
        setState("Enregistrement…");
        await saveRef.current(JSON.parse(serialized) as T);
        last.current = serialized;
        setState("Enregistré");
      } catch (err) {
        setState(`Non enregistré : ${errorMessage(err)}`);
      }
    }, delayMs);
    return () => clearTimeout(timer);
  }, [serialized, delayMs]);

  return state;
}
