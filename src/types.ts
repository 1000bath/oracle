/** A persona knowledge file */
export interface PersonaFile {
  path: string;
  category: string;
  title: string;
  content: string;
}

/** Search result with relevance score */
export interface SearchResult {
  file: PersonaFile;
  score: number;
  excerpt: string;
}

/** Embedding/vector index for persona files */
export interface EmbeddingIndex {
  files: PersonaFile[];
  vectors: number[][];
  dimensions: number;
  model?: string;
  updatedAt?: string;
}

/** Oracle configuration */
export interface OracleOptions {
  /** Path to persona directory. Default: ./persona */
  personaDir?: string;
  /** Default number of results for search */
  topK?: number;
}

/** Consultation result */
export interface ConsultResult {
  topic: string;
  answer: string;
  sources: string[];
  files: PersonaFile[];
}

/** Taste lookup result */
export interface TasteResult {
  area: string;
  preferences: string;
  source: string;
}

/** Decision consultation */
export interface DecisionResult {
  decision: string;
  analysis: string;
  sources: string[];
}

/** Persona template configuration */
export interface TemplateConfig {
  name: string;
  description: string;
  files: Record<string, unknown>;
}

/** Conflicting values found across persona data */
export interface Conflict {
  field: string;
  values: Array<{ source: string; value: unknown }>;
  resolution?: unknown;
}

/** Strategy for resolving conflicting persona values */
export type ResolutionStrategy = "latest" | "merge" | "prefer-source" | "manual";

/** Result from syncing persona data */
export interface SyncResult {
  profile: boolean;
  repos: number;
  errors: string[];
  timestamp: string;
}

/** Persona validation result */
export interface ValidationResult {
  valid: boolean;
  files: number;
  errors: string[];
  warnings: string[];
}
