import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { DetailPanel } from "./DetailPanel";
import { ItemForm } from "./ItemForm";
import { LibraryPage } from "./LibraryPage";
import { Shell } from "./Shell";
import { ToastProvider } from "./Toasts";

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
        {
          element: <LibraryPage />,
          children: [
            { index: true, element: null },
            { path: "items/:id", element: <DetailPanel /> },
          ],
        },
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
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
