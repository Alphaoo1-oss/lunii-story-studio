import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/baloo-2/latin-400.css";
import "@fontsource/baloo-2/latin-500.css";
import "@fontsource/baloo-2/latin-700.css";
import { App } from "./App";
import { applyTheme, savedTheme } from "./lib/theme";
import "./styles.css";

applyTheme(savedTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
