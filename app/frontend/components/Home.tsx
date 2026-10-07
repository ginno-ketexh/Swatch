type HomeProps = {
  version: string;
};

// Blank home screen. Tokens (bg-canvas, font-display, …) come from
// app/frontend/entrypoints/application.css.
export function Home({ version }: HomeProps) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="border-b border-accent px-6 py-5">
        <p className="font-display text-2xl">Swatch</p>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-5xl">Swatch</h1>
        <p className="mt-4 text-lg">Version {version}</p>
      </main>
    </>
  );
}
