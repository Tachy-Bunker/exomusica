import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./fonts.css";
import "./global.css";
import "./lib/skin";
import { registerServiceWorker } from "./lib/offlinePack";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
