export type EvidenceCoords = {
  x: number;
  y: number;
  w: number;
  h: number;
} | null;

export type EvidenceLocation = {
  page: number | null;
  quote: string | null;
  coords: EvidenceCoords;
};

export type FieldEvidenceEntry = {
  value: unknown;
  confidence: number | null;
  evidence: EvidenceLocation;
};

export type FieldEvidenceMap = Record<string, FieldEvidenceEntry>;
