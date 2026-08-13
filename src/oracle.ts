import { PersonaRAG } from "./rag.js";
import type { OracleOptions, ConsultResult, TasteResult, DecisionResult, ExplainResult, Evidence, SearchResult, IdentityContextOptions, IdentityContextResult } from "./types.js";

/**
 * Oracle — a persona framework.
 *
 * Reads identity data from ~/.oracleai/ (JSON files).
 * AI agents consult Oracle to understand who Jonus is,
 * how he thinks, and what he prefers — without asking him.
 *
 * @example
 * ```ts
 * import { Oracle } from "mantic";
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
  private readonly defaultTopK: number;
  private readonly identityCache = new Map<string, IdentityContextResult>();

  constructor(options?: OracleOptions) {
    const dir = options?.personaDir ?? PersonaRAG.defaultDir();
    this.rag = new PersonaRAG(dir);
    this.defaultTopK = normalizeTopK(options?.topK ?? 5);
  }

  consult(topic: string, context?: string): ConsultResult {
    const query = context ? `${topic} ${context}` : topic;
    const results = this.rag.search(query, this.defaultTopK);
    return {
      topic,
      answer: results.map((r) => `[${r.file.path}] ${r.excerpt}`).join("\n\n"),
      sources: results.map((r) => r.file.path),
      files: results.map((r) => r.file),
      sourceIds: results.map((r) => r.sourceId ?? r.file.path),
      evidence: toEvidence(results),
      confidence: aggregateConfidence(results),
    };
  }

  taste(area: string): TasteResult {
    const results = this.rag.search(`taste ${area}`, Math.min(this.defaultTopK, 3));
    return {
      area,
      preferences: results.map((r) => r.excerpt).join("\n\n"),
      source: results[0]?.file.path ?? "",
      sourceIds: results.map((r) => r.sourceId ?? r.file.path),
      evidence: toEvidence(results),
      confidence: aggregateConfidence(results),
    };
  }

  decide(decision: string, options?: string[]): DecisionResult {
    const query = `decision ${decision} ${options?.join(" ") ?? ""}`;
    const results = this.rag.search(query, Math.min(this.defaultTopK, 3));
    return {
      decision,
      analysis: results.map((r) => `### ${r.file.title}\n${r.excerpt}`).join("\n\n"),
      sources: results.map((r) => r.file.path),
      sourceIds: results.map((r) => r.sourceId ?? r.file.path),
      evidence: toEvidence(results),
      confidence: aggregateConfidence(results),
    };
  }

  search(query: string, topK?: number): SearchResult[] {
    return this.rag.search(query, normalizeTopK(topK ?? this.defaultTopK));
  }

  /** Explain an answer using only excerpts returned by the existing RAG index. */
  explain(topic: string, context?: string): ExplainResult {
    const consulted = this.consult(topic, context);
    const evidence = consulted.evidence ?? [];
    const explanation = evidence.length
      ? evidence.map((item) => `- ${item.source}: ${item.excerpt}`).join("\n")
      : "No matching persona evidence was found.";
    return { topic, explanation, confidence: consulted.confidence ?? 0, sourceIds: consulted.sourceIds ?? consulted.sources, evidence };
  }

  /**
   * Return a small, reusable identity context from the existing RAG index.
   * Results are cached for this Oracle instance; persona files are loaded at
   * construction time, so the cache cannot become inconsistent with the index.
   */
  identityContext(query = "identity", options: IdentityContextOptions = {}): IdentityContextResult {
    const topK = normalizeTopK(options.topK ?? this.defaultTopK);
    const maxChars = normalizeMaxChars(options.maxChars ?? 4000);
    const key = `${query}\0${topK}\0${maxChars}`;
    const cached = this.identityCache.get(key);
    if (cached) return cloneIdentityContext(cached);

    const results = this.rag.search(query, topK);
    const chunks: string[] = [];
    let used = 0;
    let truncated = false;
    for (const result of results) {
      const chunk = `[${result.file.path}] ${result.excerpt}`;
      const separator = chunks.length ? "\n\n" : "";
      const remaining = maxChars - used - separator.length;
      if (remaining <= 0) { truncated = true; break; }
      if (chunk.length <= remaining) {
        chunks.push(separator + chunk);
        used += separator.length + chunk.length;
      } else {
        chunks.push(separator + chunk.slice(0, remaining));
        truncated = true;
        break;
      }
    }
    const value: IdentityContextResult = {
      context: chunks.join(""),
      sources: results.slice(0, chunks.length).map((result) => result.file.path),
      files: results.slice(0, chunks.length).map((result) => result.file),
      truncated,
    };
    this.identityCache.set(key, value);
    return cloneIdentityContext(value);
  }

  /** Alias for the default identity context. */
  identity(options?: IdentityContextOptions): IdentityContextResult {
    return this.identityContext("identity", options);
  }

  stats() { return this.rag.getStats(); }
  files() { return this.rag.getAll(); }
}


function normalizeMaxChars(value: number): number {
  if (!Number.isFinite(value)) return 4000;
  return Math.max(1, Math.min(100_000, Math.trunc(value)));
}

function cloneIdentityContext(value: IdentityContextResult): IdentityContextResult {
  return { ...value, sources: [...value.sources], files: value.files.map((file) => ({ ...file })) };
}

function normalizeTopK(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(100, Math.trunc(value)));
}

function toEvidence(results: SearchResult[]): Evidence[] {
  return results.map((r) => ({ sourceId: r.sourceId ?? r.file.path, source: r.file.path, excerpt: r.excerpt, score: r.score }));
}

function aggregateConfidence(results: SearchResult[]): number {
  return results.length ? Math.max(...results.map((r) => r.confidence ?? 0)) : 0;
}
