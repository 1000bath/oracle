import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { homedir } from "node:os";
import type { PersonaFile, SearchResult } from "./types.js";

/**
 * Persona RAG — searches JSON knowledge files from ~/.oracleai/
 * Zero runtime dependencies.
 */
export class PersonaRAG {
  private files: PersonaFile[] = [];
  private index = new Map<string, Map<number, number>>();

  constructor(private dataDir: string) {
    this.loadFiles(dataDir);
    this.buildIndex();
  }

  /** Resolve ~/.oracleai/ directory */
  static defaultDir(): string {
    return join(homedir(), ".oracleai");
  }

  /** Load all .json files recursively from data directory */
  private loadFiles(dir: string): void {
    if (!existsSync(dir)) return;
    const walk = (d: string, category: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full, entry.name);
        } else if (extname(entry.name) === ".json") {
          try {
            const raw = readFileSync(full, "utf-8");
            const data = JSON.parse(raw);
            const relPath = relative(dir, full);
            const title = this.extractTitle(data, relPath);
            const content = this.flattenJson(data);
            this.files.push({ path: relPath, category, title, content });
          } catch { /* skip malformed */ }
        }
      }
    };
    walk(dir, "root");
  }

  private extractTitle(data: unknown, fallback: string): string {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      if (typeof obj.name === "string") return obj.name;
      if (typeof obj.title === "string") return obj.title;
      if (typeof obj.style === "string") return obj.style;
    }
    return fallback.replace(/\.json$/, "").replace(/[/\\]/g, " > ");
  }

  /** Flatten JSON object to searchable text */
  private flattenJson(obj: unknown, prefix = ""): string {
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) return obj.map((v) => this.flattenJson(v, prefix)).join(" ");
    if (typeof obj === "object" && obj !== null) {
      return Object.entries(obj as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${this.flattenJson(v, prefix + k + ".")}`)
        .join(" ");
    }
    return String(obj);
  }

  private buildIndex(): void {
    this.files.forEach((file, idx) => {
      const counts = new Map<string, number>();
      for (const t of this.tokenize(file.content + " " + file.title + " " + file.path)) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      for (const [term, count] of counts) {
        if (!this.index.has(term)) this.index.set(term, new Map());
        this.index.get(term)!.set(idx, count);
      }
    });
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  search(query: string, topK = 5): SearchResult[] {
    const terms = this.tokenize(query);
    const scores = new Map<number, number>();
    for (const term of terms) {
      const tf = this.index.get(term);
      if (!tf) continue;
      const idf = Math.log(this.files.length / (1 + tf.size));
      for (const [idx, count] of tf) {
        scores.set(idx, (scores.get(idx) ?? 0) + count * idf);
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([idx, score]) => ({
        file: this.files[idx],
        score,
        excerpt: this.excerpt(this.files[idx].content, terms),
      }));
  }

  private excerpt(content: string, terms: string[], ctx = 300): string {
    const lower = content.toLowerCase();
    let bestPos = 0, bestScore = 0;
    for (let i = 0; i < content.length; i += 50) {
      const win = lower.slice(i, i + 200);
      const s = terms.filter((t) => win.includes(t)).length;
      if (s > bestScore) { bestScore = s; bestPos = i; }
    }
    const start = Math.max(0, bestPos - ctx);
    const end = Math.min(content.length, bestPos + ctx);
    return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
  }

  getAll(): PersonaFile[] { return [...this.files]; }
  getStats() {
    return {
      files: this.files.length,
      terms: this.index.size,
      categories: [...new Set(this.files.map((f) => f.category))],
    };
  }
}
