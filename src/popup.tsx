import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { ReminderPopup } from "./features/reminder-popup/ReminderPopup";

// Floating-bubble popup: the window itself is transparent (see
// platform::windows), so only the nook + card paint. The shared stylesheet
// sets an opaque body background — override it here, popup entry only.
document.documentElement.style.background = "transparent";
document.body.style.background = "transparent";

// System theme until persisted settings load (the popup hook reconciles).
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
}

const rootElement = document.getElementById("popup-root");

if (rootElement === null) {
  throw new Error("Missing #popup-root element in popup.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <ReminderPopup />
  </StrictMode>,
);
