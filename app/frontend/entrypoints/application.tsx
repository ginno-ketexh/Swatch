import { createRoot } from "react-dom/client";
import { Home } from "../components/Home";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Swatch could not find the #root element.");
}

const version = rootElement.dataset.version ?? "unknown";

createRoot(rootElement).render(<Home version={version} />);
