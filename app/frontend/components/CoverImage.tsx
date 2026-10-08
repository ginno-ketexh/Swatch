import { useState } from "react";
import type { Item } from "../api/types";

export function CoverImage({ item, view, eager }: { item: Item; view: "grid" | "list"; eager: boolean }) {
  const image = item.image;
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  if (!image) return null;

  const tone = item.color ?? undefined;
  const list = view === "list";
  const src = retried ? `${image.urls.card}${image.urls.card.includes("?") ? "&" : "?"}retry=1` : image.urls.card;

  return (
    <div
      className={list ? "cover cover-list" : "cover cover-grid"}
      style={tone ? { backgroundColor: tone } : undefined}
    >
      {failed ? (
        <p className="cover-fallback">Image unavailable</p>
      ) : (
        <img
          alt=""
          src={src}
          srcSet={list ? undefined : `${image.urls.card} 400w, ${image.urls.card_2x} 800w`}
          sizes={list ? "64px" : "(min-width: 40rem) 50vw, 100vw"}
          width={image.width ?? (list ? 64 : 400)}
          height={image.height ?? (list ? 64 : 300)}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => {
            if (!retried) setRetried(true);
            else setFailed(true);
          }}
        />
      )}
    </div>
  );
}
