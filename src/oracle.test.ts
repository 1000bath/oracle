import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Oracle } from "./oracle.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function oracle(topK?: number): Oracle {
  const dir = mkdtempSync(join(tmpdir(), "oracle-test-"));
  dirs.push(dir);
  writeFileSync(join(dir, "a.json"), JSON.stringify({ title: "A", content: "typescript architecture testing" }));
  writeFileSync(join(dir, "b.json"), JSON.stringify({ title: "B", content: "typescript design" }));
  return new Oracle({ personaDir: dir, topK });
}

describe("Oracle options", () => {
  it("uses configured topK for consult and search", () => {
    const instance = oracle(1);
    expect(instance.search("typescript")).toHaveLength(1);
    expect(instance.consult("typescript").files).toHaveLength(1);
  });


  it("explains consultations with source IDs and evidence", () => {
    const result = oracle(2).explain("typescript");
    expect(result.sourceIds).toEqual((result.evidence ?? []).map((item: import("./types.js").Evidence) => item.sourceId));
    expect((result.evidence ?? []).length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("clamps invalid and excessive topK values", () => {
    expect(oracle(0).search("typescript")).toHaveLength(1);
    expect(oracle(1000).search("typescript")).toHaveLength(2);
  });
});


describe("identity context", () => {
  it("returns bounded deterministic context and sources", () => {
    const instance = oracle();
    const result = instance.identityContext("typescript", { topK: 2, maxChars: 40 });
    expect(result.context.length).toBeLessThanOrEqual(40);
    expect(result.sources).toEqual(result.files.map((file) => file.path));
    expect(result.truncated).toBe(true);
    expect(instance.identityContext("typescript", { topK: 2, maxChars: 40 })).toEqual(result);
  });

  it("does not expose mutable cached arrays", () => {
    const instance = oracle();
    const first = instance.identityContext("typescript", { maxChars: 1000 });
    first.sources.push("mutated");
    expect(instance.identityContext("typescript", { maxChars: 1000 }).sources).not.toContain("mutated");
  });
});
