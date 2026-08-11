import type { PersonaFile, SearchResult } from "./types.js";

/**
 * Semantic search using TF-IDF + cosine similarity.
 * Zero dependencies — pure TypeScript implementation.
 */
export class SemanticSearch {
  private idf = new Map<string, number>();
  private docVectors = new Map<number, Map<string, number>>();
  private files: PersonaFile[] = [];

  constructor(files: PersonaFile[]) {
    this.files = files;
    this.buildIndex();
  }

  /** Tokenize text into terms */
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  /** Build TF-IDF index */
  private buildIndex(): void {
    const docCount = this.files.length;
    const df = new Map<string, number>();

    // Calculate document frequency
    for (const file of this.files) {
      const terms = new Set(this.tokenize(file.content));
      for (const term of terms) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }

    // Calculate IDF
    for (const [term, freq] of df) {
      this.idf.set(term, Math.log((docCount + 1) / (freq + 1)) + 1);
    }

    // Build document vectors (TF * IDF)
    for (let i = 0; i < this.files.length; i++) {
      const terms = this.tokenize(this.files[i].content);
      const tf = new Map<string, number>();
      for (const term of terms) {
        tf.set(term, (tf.get(term) ?? 0) + 1);
      }

      const vector = new Map<string, number>();
      for (const [term, count] of tf) {
        const tfidf = (count / terms.length) * (this.idf.get(term) ?? 1);
        vector.set(term, tfidf);
      }
      this.docVectors.set(i, vector);
    }
  }

  /** Search with cosine similarity */
  search(query: string, topK: number = 5): SearchResult[] {
    const queryTerms = this.tokenize(query);
    const queryVector = new Map<string, number>();

    // Build query vector
    const tf = new Map<string, number>();
    for (const term of queryTerms) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
    }
    for (const [term, count] of tf) {
      const tfidf = (count / queryTerms.length) * (this.idf.get(term) ?? 1);
      queryVector.set(term, tfidf);
    }

    // Calculate cosine similarity
    const results: SearchResult[] = [];
    for (let i = 0; i < this.files.length; i++) {
      const docVector = this.docVectors.get(i);
      if (!docVector) continue;

      const similarity = this.cosineSimilarity(queryVector, docVector);
      if (similarity > 0.01) {
        const excerpt = this.extractRelevantExcerpt(this.files[i].content, queryTerms);
        results.push({
          file: this.files[i],
          score: similarity,
          excerpt,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /** Cosine similarity between two vectors */
  private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [term, value] of a) {
      normA += value * value;
      if (b.has(term)) {
        dotProduct += value * (b.get(term) ?? 0);
      }
    }

    for (const [, value] of b) {
      normB += value * value;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /** Extract relevant excerpt based on query terms */
  private extractRelevantExcerpt(content: string, queryTerms: string[]): string {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    if (sentences.length === 0) return content.slice(0, 200);

    // Find sentence with most query terms
    let bestSentence = sentences[0];
    let bestScore = 0;

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (lower.includes(term)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence;
      }
    }

    return bestSentence.trim().slice(0, 300);
  }
}
