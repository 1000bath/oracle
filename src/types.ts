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
