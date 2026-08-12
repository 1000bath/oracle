/** Memory classification used to guide retention and conflict resolution. */
export type MemoryType = "episodic" | "semantic" | "procedural" | "conversational";

/** Optional, backwards-compatible metadata for a persona/memory file. */
export interface MemoryMetadata {
  type?: MemoryType;
  /** Confidence in this memory, expressed as a value from 0 to 1. */
  confidence?: number;
  /** Monotonically increasing revision of the memory. */
  version?: number;
  /** Path/identifier of the memory this revision supersedes. */
  supersedes?: string | string[];
  /** Inclusive validity window (ISO-8601 timestamps). */
  validFrom?: string;
  validUntil?: string;
}

/** A persona knowledge file */
export interface PersonaFile {
  path: string;
  category: string;
  title: string;
  content: string;
  /** Absent for legacy files with no metadata. */
  metadata?: MemoryMetadata;
}

/** Search result with relevance score */
export interface SearchResult {
  file: PersonaFile;
  score: number;
  excerpt: string;
  /** Stable identifier for this evidence (currently the persona-relative path). */
  sourceId?: string;
  /** Retrieval confidence in the range 0..1, when supplied by a higher-level API. */
  confidence?: number;
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

/** A retrieved excerpt supporting an Oracle result. */
export interface Evidence {
  sourceId: string;
  source: string;
  excerpt: string;
  score: number;
}

/** Consultation result */
export interface ConsultResult {
  topic: string;
  answer: string;
  sources: string[];
  files: PersonaFile[];
  /** Stable source identifiers; currently equivalent to `sources`. */
  sourceIds?: string[];
  /** The exact retrieved excerpts used to construct the answer. */
  evidence?: Evidence[];
  /** Retrieval confidence, normalized to 0..1. */
  confidence?: number;
}

/** Evidence-backed explanation of how retrieval supports a topic. */
export interface ExplainResult {
  topic: string;
  explanation: string;
  confidence: number;
  sourceIds: string[];
  evidence: Evidence[];
}

/** Bounded options for retrieving a reusable identity context. */
export interface IdentityContextOptions {
  /** Maximum number of matching persona files. */
  topK?: number;
  /** Maximum UTF-16 characters in the returned context. */
  maxChars?: number;
}

/** A small, cacheable context assembled from persona RAG results. */
export interface IdentityContextResult {
  context: string;
  sources: string[];
  files: PersonaFile[];
  truncated: boolean;
}

/** Taste lookup result */
export interface TasteResult {
  area: string;
  preferences: string;
  source: string;
  sourceIds?: string[];
  evidence?: Evidence[];
  confidence?: number;
}

/** Decision consultation */
export interface DecisionResult {
  decision: string;
  analysis: string;
  sources: string[];
  sourceIds?: string[];
  evidence?: Evidence[];
  confidence?: number;
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
