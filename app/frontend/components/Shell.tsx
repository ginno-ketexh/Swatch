import { Link, Outlet } from "react-router-dom";
import { Shortcuts } from "./Shortcuts";

type ShellProps = {
  version: string;
};

export function Shell({ version }: ShellProps) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-accent px-4 py-4">
        <p className="font-display text-2xl">Swatch</p>
        <div className="flex flex-wrap items-center gap-4">
          <p>Version {version}</p>
          <Shortcuts />
          <Link className="min-h-11 underline" to="/items/new">
            Add a swatch
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-8">
        <Outlet />
      </main>
    </>
  );
}
