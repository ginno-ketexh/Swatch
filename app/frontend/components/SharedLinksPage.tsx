import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, deleteShareLink, listShareLinks } from "../api/client";
import type { ShareLinkRecord } from "../api/types";
import { copyText } from "../lib/copyText";
import { itemsKey } from "../lib/items";
import { ConfirmDialog } from "./ConfirmDialog";
import { ToastViewport, useToast } from "./Toasts";

type StatusFilter = "active" | "expired" | "all";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "all", label: "All" },
];

export function SharedLinksPage() {
  const [params, setParams] = useSearchParams();
  const status = readStatus(params.get("status"));
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<ShareLinkRecord | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const listKey = ["share-links", "page", status] as const;
  const links = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => listShareLinks({ status }, signal),
  });

  const turnOff = useMutation({
    mutationFn: (id: number) => deleteShareLink(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShareLinkRecord[]>(listKey);
      queryClient.setQueryData<ShareLinkRecord[]>(listKey, (current) => (current ?? []).filter((link) => link.id !== id));
      return { previous };
    },
    onError: (error: unknown, _id, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      if (error instanceof ApiError && error.status === 404) toast.show("Already turned off", "error");
      else toast.show(error instanceof ApiError ? error.message : "Could not turn off the link", "error");
    },
    onSuccess: () => {
      toast.show("Link turned off", "success");
      void queryClient.invalidateQueries({ queryKey: ["share-links"] });
      void queryClient.invalidateQueries({ queryKey: itemsKey });
    },
  });

  function choose(next: StatusFilter) {
    const updated = new URLSearchParams(params);
    if (next === "active") updated.delete("status");
    else updated.set("status", next);
    setParams(updated);
  }

  return (
    <div>
      <h1 className="font-display text-4xl">Shared links</h1>
      <div className="mt-4 flex flex-wrap gap-3" role="group" aria-label="Filter links">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className="min-h-11 border border-ink px-3 py-2"
            aria-pressed={status === filter.value}
            onClick={() => choose(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {links.isPending ? (
        <div className="mt-8" role="status" aria-busy="true">
          <p className="sr-only">Loading shared links</p>
          <ul aria-hidden="true" className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="skeleton h-16 border border-line" />
            ))}
          </ul>
        </div>
      ) : null}

      {links.isError ? (
        <div role="alert" className="mt-8">
          <p>Could not load shared links.</p>
          <button type="button" className="mt-4 min-h-11 bg-ink px-4 py-2 text-canvas" onClick={() => void links.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {links.isSuccess && links.data.length === 0 ? (
        <p className="mt-8">
          {status === "expired"
            ? "No expired links."
            : "You haven't shared anything yet. Use Share on any swatch or tag."}
        </p>
      ) : null}

      {links.isSuccess && links.data.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {links.data.map((link) => (
            <ShareLinkRow
              key={link.id}
              link={link}
              notice={copiedId === link.id ? notice : ""}
              onCopied={(id, text) => {
                setCopiedId(id);
                setNotice(text);
              }}
              onPending={setPending}
            />
          ))}
        </ul>
      ) : null}

      <ToastViewport />
      <ConfirmDialog
        open={pending !== null}
        title={pending?.status === "expired" ? "Remove this expired link?" : "Turn off this link?"}
        description={
          pending?.status === "expired"
            ? "It is already unavailable."
            : "Anyone who has it will see 'link not available'. You can create a new link any time."
        }
        confirmLabel={pending?.status === "expired" ? "Remove" : "Turn off"}
        cancelLabel="Cancel"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const link = pending;
          setPending(null);
          if (link) turnOff.mutate(link.id);
        }}
      />
    </div>
  );
}

function ShareLinkRow({
  link,
  notice,
  onCopied,
  onPending,
}: {
  link: ShareLinkRecord;
  notice: string;
  onCopied: (id: number, text: string) => void;
  onPending: (link: ShareLinkRecord) => void;
}) {
  const fieldRef = useRef<HTMLInputElement>(null);
  const name = link.target_title || link.title || "Untitled";
  const fieldId = `share-link-${link.id}`;

  return (
    <li className="border border-line bg-surface p-4">
      <p className="break-words">
        <Link className="underline" to={libraryPath(link)}>
          {name}
        </Link>
      </p>
      {link.title ? <p className="mt-1">Public title: {link.title}</p> : null}
      <p className="mt-2">
        Created <time dateTime={link.created_at}>{formatWhen(link.created_at)}</time>
      </p>
      <p className="mt-1">
        {link.expires_at ? <time dateTime={link.expires_at}>{expiryText(link)}</time> : "Never expires"}
      </p>
      <p className="mt-1">{viewsText(link)}</p>
      <label className="mt-3 block" htmlFor={fieldId}>
        Share link
      </label>
      <input
        id={fieldId}
        ref={fieldRef}
        className="mt-1 w-full border border-ink bg-canvas px-3 py-2"
        readOnly
        value={link.url}
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-11 underline"
          onClick={() => {
            void copyText(link.url, fieldRef.current).then((result) => {
              onCopied(link.id, result === "copied" ? "Link copied" : "Press Ctrl+C to copy");
            });
          }}
        >
          Copy link to {name}
        </button>
        {link.status === "expired" ? (
          <button type="button" className="min-h-11 underline" onClick={() => onPending(link)}>
            Remove link to {name}
          </button>
        ) : (
          <button type="button" className="min-h-11 underline" onClick={() => onPending(link)}>
            Turn off link to {name}
          </button>
        )}
      </div>
      <p role="status" className="mt-2">
        {notice}
      </p>
    </li>
  );
}

function readStatus(value: string | null): StatusFilter {
  if (value === "expired" || value === "all") return value;
  return "active";
}

function libraryPath(link: ShareLinkRecord): string {
  if (link.kind === "item" && link.item_id) return `/items/${link.item_id}`;
  const name = (link.target_title ?? "").toLowerCase();
  return `/?tags=${encodeURIComponent(name)}`;
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

function expiryText(link: ShareLinkRecord): string {
  if (!link.expires_at) return "Never expires";
  const then = new Date(link.expires_at).getTime();
  const days = Math.max(1, Math.round(Math.abs(then - Date.now()) / 86_400_000));
  const unit = days === 1 ? "day" : "days";
  if (link.status === "expired" || then <= Date.now()) return `Expired ${days} ${unit} ago`;
  return `Expires in ${days} ${unit}`;
}

function viewsText(link: ShareLinkRecord): string {
  if (link.views_count === 0) return "Not opened yet";
  if (link.views_count === 1) return "Opened 1 time";
  const last = link.last_viewed_at ? `, last ${ago(link.last_viewed_at)}` : "";
  return `Opened ${link.views_count} times${last}`;
}

function ago(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
