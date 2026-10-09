export type TagRef = {
  id: number;
  name: string;
};

export type TagSummary = TagRef & {
  items_count: number;
};

export type ItemImage = {
  alt: string | null;
  width: number | null;
  height: number | null;
  content_type: string;
  byte_size: number;
  version: number;
  urls: { card: string; card_2x: string; large: string };
};

export type Item = {
  id: number;
  title: string;
  source_url: string | null;
  source_domain: string | null;
  notes: string | null;
  color: string | null;
  created_at: string;
  tags?: TagRef[];
  image?: ItemImage | null;
  shared?: boolean;
};

export type ShareLinkRecord = {
  id: number;
  url: string;
  kind: "item" | "tag";
  target_title: string | null;
  title: string | null;
  include_notes: boolean;
  include_preview_image: boolean;
  expires_at: string | null;
  views_count: number;
  last_viewed_at: string | null;
  status: "active" | "expired";
  created_at: string;
  item_id: number | null;
  tag_id: number | null;
};

export type ShareLinkInput = {
  item_id?: number;
  tag_id?: number;
  title?: string;
  include_notes: boolean;
  include_preview_image: boolean;
  expires_in: "1d" | "7d" | "30d" | "never";
};

export type ItemInput = {
  title: string;
  source_url: string;
  notes: string;
  color: string;
  tag_names?: string[];
};

export type ItemPage = {
  items: Item[];
  next_cursor: string | null;
  total_count?: number;
  ignored_tags?: string[];
};

export type FieldErrors = Record<string, string[]>;
