import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { DetailPanel } from "./DetailPanel";
import { ItemForm } from "./ItemForm";
import { LibraryPage } from "./LibraryPage";
import { ManageTagsPage } from "./ManageTagsPage";
import { SharedLinksPage } from "./SharedLinksPage";
import { Shell } from "./Shell";
import { ImagesEnabledProvider } from "../lib/imagesEnabled";
import { ToastProvider } from "./Toasts";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function appRoutes(version: string, email: string): RouteObject[] {
  return [
    {
      path: "/",
      element: <Shell version={version} email={email} />,
      children: [
        {
          element: <LibraryPage />,
          children: [
            { index: true, element: null },
            { path: "items/:id", element: <DetailPanel /> },
          ],
        },
        { path: "tags", element: <ManageTagsPage /> },
        { path: "shares", element: <SharedLinksPage /> },
        { path: "items/new", element: <ItemForm /> },
        { path: "items/:id/edit", element: <ItemForm /> },
      ],
    },
  ];
}

export function App({ version, email, imagesEnabled }: { version: string; email: string; imagesEnabled: boolean }) {
  const [queryClient] = useState(makeQueryClient);
  const [router] = useState(() => createBrowserRouter(appRoutes(version, email)));

  return (
    <QueryClientProvider client={queryClient}>
      <ImagesEnabledProvider enabled={imagesEnabled}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ImagesEnabledProvider>
    </QueryClientProvider>
  );
}
