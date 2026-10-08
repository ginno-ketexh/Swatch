import { createRoot } from "react-dom/client";
import { App } from "../components/App";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <App
      version={root.dataset.version ?? "unknown"}
      email={root.dataset.email ?? ""}
      imagesEnabled={root.dataset.imagesEnabled === "true"}
    />,
  );
}
