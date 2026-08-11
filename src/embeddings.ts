import type { PersonaFile, SearchResult } from "./types.js";

type Vector = Map<string, number>;

export interface EmbeddingIndex {
  files: PersonaFile[];
  idf: Map<string, number>;
  vectors: Vector[];
  norms: number[];
}

export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1);
}

export function buildEmbeddings(files: PersonaFile[]): EmbeddingIndex {
  const indexedFiles = [...files];
  const documents = indexedFiles.map((file) => {
    const terms = tokenizeText([file.title, file.path, file.category, file.content].join(" "));
    return {
      terms,
      uniqueTerms: new Set(terms),
    };
  });

  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of document.uniqueTerms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  const documentCount = indexedFiles.length;
  for (const [term, frequency] of documentFrequency) {
    idf.set(term, Math.log((documentCount + 1) / (frequency + 1)) + 1);
  }

  const vectors = documents.map((document) => buildVector(document.terms, idf));
  const norms = vectors.map(vectorNorm);

  return {
    files: indexedFiles,
    idf,
    vectors,
    norms,
  };
}

export function searchEmbeddings(index: EmbeddingIndex, query: string, topK = 5): SearchResult[] {
  if (topK <= 0 || index.files.length === 0) return [];

  const queryTerms = tokenizeText(query);
  if (queryTerms.length === 0) return [];

  const queryVector = buildVector(queryTerms, index.idf);
  const queryNorm = vectorNorm(queryVector);
  if (queryNorm === 0) return [];

  return index.files
    .map((file, position) => {
      const score = cosineSimilarity(queryVector, queryNorm, index.vectors[position], index.norms[position]);
      return {
        file,
        score,
        excerpt: extractExcerpt(file.content, queryTerms),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function buildVector(terms: string[], idf: Map<string, number>): Vector {
  const vector = new Map<string, number>();
  if (terms.length === 0) return vector;

  const counts = new Map<string, number>();
  for (const term of terms) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }

  for (const [term, count] of counts) {
    const termIdf = idf.get(term);
    if (termIdf === undefined) continue;
    vector.set(term, (count / terms.length) * termIdf);
  }

  return vector;
}

function cosineSimilarity(queryVector: Vector, queryNorm: number, documentVector: Vector, documentNorm: number): number {
  if (queryNorm === 0 || documentNorm === 0) return 0;

  let dotProduct = 0;
  for (const [term, queryWeight] of queryVector) {
    dotProduct += queryWeight * (documentVector.get(term) ?? 0);
  }

  return dotProduct / (queryNorm * documentNorm);
}

function vectorNorm(vector: Vector): number {
  let sum = 0;
  for (const weight of vector.values()) {
    sum += weight * weight;
  }
  return Math.sqrt(sum);
}

function extractExcerpt(content: string, queryTerms: string[], contextLength = 300): string {
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
