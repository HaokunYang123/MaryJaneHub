export type DocumentBBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SearchHighlight = {
  query: string;
  match: string | null;
  quote: string | null;
  page: number | null;
  coords: DocumentBBox | null;
};

export type SearchResult = {
  id: string;
  fileName: string;
  documentType: string | null;
  score?: number;
  similarity?: number;
  extraction?: Record<string, unknown>;
  duplicateCount?: number;
  highlight?: SearchHighlight;
};

export type FactPair = {
  label: string;
  value: string;
};

export type SourceContext = {
  query: string;
  fileName: string;
  quote: string | null;
  token: string | null;
  page: number | null;
  coords: DocumentBBox | null;
  facts: FactPair[];
};
