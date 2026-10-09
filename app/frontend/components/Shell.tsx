import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { csrfToken } from "../api/client";
import { emailLabel } from "../lib/emailLabel";
import { Shortcuts } from "./Shortcuts";

type ShellProps = {
  version: string;
  email: string;
};

export function Shell({ version, email }: ShellProps) {
  const location = useLocation();
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    const onSignedOut = () => setSignedOut(true);
    window.addEventListener("swatch:signed-out", onSignedOut);
    return () => window.removeEventListener("swatch:signed-out", onSignedOut);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="flex max-w-full flex-wrap items-center justify-between gap-3 border-b border-accent px-4 py-4">
        <p className="font-display text-2xl">Swatch</p>
        <nav className="flex max-w-full flex-wrap items-center gap-x-4 gap-y-2" aria-label="Main">
          <p>Version {version}</p>
          <p title={email}>Signed in as {emailLabel(email)}</p>
          <a className="min-h-11 underline" href="/account">
            Account
          </a>
          <Shortcuts />
          <Link className="min-h-11 underline" to={{ pathname: "/tags", search: location.search }}>
            Manage tags
          </Link>
          <Link className="min-h-11 underline" to="/shares">
            Shared links
          </Link>
          <Link className="min-h-11 underline" to="/items/new">
            Add a swatch
          </Link>
          <form method="post" action="/session">
            <input type="hidden" name="_method" value="delete" />
            <input type="hidden" name="authenticity_token" value={csrfToken()} />
            <button type="submit" className="min-h-11 underline">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-8">
        <Outlet />
      </main>
      {signedOut ? (
        <div className="toast-stack">
          <div className="toast" role="alert">
            <p>
              You were signed out.{" "}
              <a className="underline" href="/sign-in?return_to=/" target="_blank" rel="noopener">
                Sign in again in a new tab
              </a>
              , then save again.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
