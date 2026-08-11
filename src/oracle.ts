import { PersonaRAG } from "./rag.js";
import type { OracleOptions, ConsultResult, TasteResult, DecisionResult, SearchResult } from "./types.js";

/**
 * Oracle — a persona framework.
 *
 * Reads identity data from ~/.oracleai/ (JSON files).
 * AI agents consult Oracle to understand who Jonus is,
 * how he thinks, and what he prefers — without asking him.
 *
 * @example
 * ```ts
 * import { Oracle } from "dek-oracle";
 *
 * const oracle = new Oracle();
 *
 * // How would Jonus approach this?
 * const result = oracle.consult("choosing a database");
 *
 * // What's his taste in UI?
 * const taste = oracle.taste("ui");
 *
 * // Search all persona data
 * const hits = oracle.search("TypeScript zero dependencies");
 * ```
 */
export class Oracle {
  private rag: PersonaRAG;

  constructor(options?: OracleOptions) {
    const dir = options?.personaDir ?? PersonaRAG.defaultDir();
    this.rag = new PersonaRAG(dir);
  }

  consult(topic: string, context?: string): ConsultResult {
    const query = context ? `${topic} ${context}` : topic;
    const results = this.rag.search(query, 5);
    return {
      topic,
      answer: results.map((r) => `[${r.file.path}] ${r.excerpt}`).join("\n\n"),
      sources: results.map((r) => r.file.path),
      files: results.map((r) => r.file),
    };
  }

  taste(area: string): TasteResult {
    const results = this.rag.search(`taste ${area}`, 3);
    return {
      area,
      preferences: results.map((r) => r.excerpt).join("\n\n"),
      source: results[0]?.file.path ?? "",
    };
  }

  decide(decision: string, options?: string[]): DecisionResult {
    const query = `decision ${decision} ${options?.join(" ") ?? ""}`;
    const results = this.rag.search(query, 3);
    return {
      decision,
      analysis: results.map((r) => `### ${r.file.title}\n${r.excerpt}`).join("\n\n"),
      sources: results.map((r) => r.file.path),
    };
  }

  search(query: string, topK?: number): SearchResult[] {
    return this.rag.search(query, topK ?? 5);
  }

  stats() { return this.rag.getStats(); }
  files() { return this.rag.getAll(); }
}
