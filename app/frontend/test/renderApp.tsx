import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { appRoutes, makeQueryClient } from "../components/App";
import { ToastProvider } from "../components/Toasts";

export function renderApp(path: string) {
  const queryClient = makeQueryClient();
  const router = createMemoryRouter(appRoutes("0.1.0"), { initialEntries: [path] });

  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
