export type TagRef = {
  id: number;
  name: string;
};

export type TagSummary = TagRef & {
  items_count: number;
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
