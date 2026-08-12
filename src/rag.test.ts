import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PersonaRAG } from "./rag.js";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const dataDir = mkdtempSync(join(tmpdir(), "oracle-rag-"));
let rag: PersonaRAG;
beforeAll(() => {
  writeFileSync(join(dataDir, "identity.json"), JSON.stringify({ name: "Ari", role: "TypeScript engineer", preferences: "dark mode UI" }));
  writeFileSync(join(dataDir, "decisions.json"), JSON.stringify({ decision: "algorithm risk checks" }));
  rag = new PersonaRAG(dataDir);
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("PersonaRAG", () => {

  it("loads persona files from ~/.oracleai/", () => {
    const stats = rag.getStats();
    expect(stats.files).toBeGreaterThan(0);
    expect(stats.terms).toBeGreaterThan(0);
  });

  it("searches by keyword", () => {
    const results = rag.search("typescript", 3);
    expect(results.length).toBeGreaterThan(0);
  });

  it("searches taste", () => {
    const results = rag.search("dark mode UI", 3);
    expect(results.length).toBeGreaterThan(0);
  });

  it("searches decision", () => {
    const results = rag.search("decision algorithm risk", 3);
    expect(results.length).toBeGreaterThan(0);
  });
});
