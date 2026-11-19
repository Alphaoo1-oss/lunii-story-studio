// Thème de l'interface : « auto » suit le réglage du système (clair ou sombre).
export type ThemeChoice = "auto" | "light" | "dark";

const KEY = "lss-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function savedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === "dark" || (choice === "auto" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Stockage indisponible : le choix vaut pour cette page seulement.
  }
  applyTheme(choice);
}

// Suit le changement de thème du système tant que le choix est « auto ».
media.addEventListener("change", () => {
  if (savedTheme() === "auto") applyTheme("auto");
});
