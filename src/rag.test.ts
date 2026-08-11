import { describe, it, expect } from "vitest";
import { PersonaRAG } from "./rag.js";
import { join } from "node:path";
import { homedir } from "node:os";

const dataDir = join(homedir(), ".oracleai");

describe("PersonaRAG", () => {
  const rag = new PersonaRAG(dataDir);

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
