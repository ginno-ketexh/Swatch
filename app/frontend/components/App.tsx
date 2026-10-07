import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { ItemForm } from "./ItemForm";
import { LibraryPage } from "./LibraryPage";
import { Shell } from "./Shell";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function appRoutes(version: string): RouteObject[] {
  return [
    {
      path: "/",
      element: <Shell version={version} />,
      children: [
        { index: true, element: <LibraryPage /> },
        { path: "items/new", element: <ItemForm /> },
        { path: "items/:id/edit", element: <ItemForm /> },
      ],
    },
  ];
}

export function App({ version }: { version: string }) {
  const [queryClient] = useState(makeQueryClient);
  const [router] = useState(() => createBrowserRouter(appRoutes(version)));

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
