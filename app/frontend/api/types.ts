export type Item = {
  id: number;
  title: string;
  source_url: string | null;
  source_domain: string | null;
  notes: string | null;
  color: string | null;
  created_at: string;
};

export type ItemInput = {
  title: string;
  source_url: string;
  notes: string;
  color: string;
};

export type ItemPage = {
  items: Item[];
  next_cursor: string | null;
};

export type FieldErrors = Record<string, string[]>;
