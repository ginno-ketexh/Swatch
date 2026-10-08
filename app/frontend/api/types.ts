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
