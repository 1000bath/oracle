import type { PersonaFile, SearchResult } from "./types.js";

export type { PersonaFile, SearchResult } from "./types.js";

type Vector = Map<string, number>;

/**
 * TF-IDF vector index for persona files.
 * Zero dependencies, pure TypeScript.
 */
export class VectorIndex {
  private readonly files: PersonaFile[];
  private readonly idf = new Map<string, number>();
  private readonly vectors: Vector[] = [];
  private readonly norms: number[] = [];

  constructor(files: PersonaFile[]) {
    this.files = [...files];
    this.buildIndex();
  }

  search(query: string, topK = 5): SearchResult[] {
    if (topK <= 0 || this.files.length === 0) return [];

    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const queryVector = this.buildVector(queryTerms);
    const queryNorm = this.norm(queryVector);
    if (queryNorm === 0) return [];

    return this.files
      .map((file, index) => {
        const score = this.cosineSimilarity(queryVector, queryNorm, this.vectors[index], this.norms[index]);
        return {
          file,
          score,
          excerpt: this.excerpt(file.content, queryTerms),
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private buildIndex(): void {
    const documentTerms = this.files.map((file) => {
      const terms = this.tokenize([file.title, file.path, file.category, file.content].join(" "));
      return {
        terms,
        uniqueTerms: new Set(terms),
      };
    });

    const documentFrequency = new Map<string, number>();
    for (const document of documentTerms) {
      for (const term of document.uniqueTerms) {
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      }
    }

    const documentCount = this.files.length;
    for (const [term, frequency] of documentFrequency) {
      this.idf.set(term, Math.log((documentCount + 1) / (frequency + 1)) + 1);
    }

    for (const document of documentTerms) {
      const vector = this.buildVector(document.terms);
      this.vectors.push(vector);
      this.norms.push(this.norm(vector));
    }
  }

  private buildVector(terms: string[]): Vector {
    const vector = new Map<string, number>();
    if (terms.length === 0) return vector;

    const counts = new Map<string, number>();
    for (const term of terms) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }

    for (const [term, count] of counts) {
      const idf = this.idf.get(term);
      if (idf === undefined) continue;
      vector.set(term, (count / terms.length) * idf);
    }

    return vector;
  }

  private cosineSimilarity(queryVector: Vector, queryNorm: number, documentVector: Vector, documentNorm: number): number {
    if (queryNorm === 0 || documentNorm === 0) return 0;

    let dotProduct = 0;
    for (const [term, queryWeight] of queryVector) {
      dotProduct += queryWeight * (documentVector.get(term) ?? 0);
    }

    return dotProduct / (queryNorm * documentNorm);
  }

  private norm(vector: Vector): number {
    let sum = 0;
    for (const weight of vector.values()) {
      sum += weight * weight;
    }
    return Math.sqrt(sum);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙\s]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 1);
  }

  private excerpt(content: string, queryTerms: string[], contextLength = 300): string {
    if (content.length <= contextLength) return content;

    const lowerContent = content.toLowerCase();
    let bestPosition = 0;
    let bestScore = 0;

    for (let position = 0; position < content.length; position += 80) {
      const window = lowerContent.slice(position, position + contextLength);
      const score = queryTerms.reduce((total, term) => total + (window.includes(term) ? 1 : 0), 0);

      if (score > bestScore) {
        bestScore = score;
        bestPosition = position;
      }
    }

    const start = Math.max(0, bestPosition - Math.floor(contextLength / 2));
    const end = Math.min(content.length, start + contextLength);

    return `${start > 0 ? "..." : ""}${content.slice(start, end)}${end < content.length ? "..." : ""}`;
  }
}
