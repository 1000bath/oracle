import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConflictResolver, consolidatePersona } from "./conflict.js";
import { exportPersona, importPersona, validatePersona } from "./export-import.js";
import { PersonaRAG } from "./rag.js";
import { SemanticSearch } from "./semantic-search.js";
import { VectorIndex, type PersonaFile } from "./semantic-vector.js";
import { PERSONA_TEMPLATES, createFromTemplate, listTemplates } from "./templates.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "oracle-extended-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function sampleFiles(): PersonaFile[] {
  return [
    {
      path: "taste/software.json",
      category: "taste",
      title: "Software Taste",
      content: "TypeScript strict mode functional composition minimal dependencies",
    },
    {
      path: "taste/ui.json",
      category: "taste",
      title: "Interface Taste",
      content: "High contrast accessible controls dark mode calm dashboards",
    },
    {
      path: "decisions/risk.json",
      category: "decisions",
      title: "Risk Decisions",
      content: "Prefer reversible decisions with explicit risk checks and rollback plans",
    },
  ];
}

describe("semantic search", () => {
  it("ranks the most relevant TF-IDF document first", () => {
    const search = new SemanticSearch(sampleFiles());

    const results = search.search("typescript functional dependencies", 3);

    expect(results[0]?.file.path).toBe("taste/software.json");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("respects the requested topK limit", () => {
    const search = new SemanticSearch(sampleFiles());

    const results = search.search("taste mode decisions risk", 2);

    expect(results).toHaveLength(2);
  });

  it("returns an excerpt containing query context", () => {
    const search = new SemanticSearch(sampleFiles());

    const [result] = search.search("rollback risk");

    expect(result.excerpt.toLowerCase()).toContain("risk");
  });

  it("returns no semantic results for unmatched terms", () => {
    const search = new SemanticSearch(sampleFiles());

    expect(search.search("quantum banana")).toEqual([]);
  });

  it("tokenizes punctuation and casing consistently", () => {
    const search = new SemanticSearch(sampleFiles());

    expect(search.tokenize("TypeScript, STRICT-mode!")).toEqual(["typescript", "strict", "mode"]);
  });

  it("VectorIndex ranks matching files above unrelated files", () => {
    const index = new VectorIndex(sampleFiles());

    const [result] = index.search("accessible dark controls");

    expect(result.file.path).toBe("taste/ui.json");
  });

  it("loads optional memory metadata while preserving legacy file shape", () => {
    const dir = tempDir();
    writeJson(join(dir, "episode.json"), {
      metadata: { type: "episodic", confidence: 0.8, version: 2, supersedes: "old.json", validFrom: "2024-01-01T00:00:00Z" },
      title: "Deploy", content: "deployed the service"
    });
    writeJson(join(dir, "legacy.json"), { title: "Legacy", content: "old memory" });
    const files = new PersonaRAG(dir).getAll();
    const episode = files.find((file) => file.path === "episode.json");
    const legacy = files.find((file) => file.path === "legacy.json");
    expect(episode?.metadata).toEqual({ type: "episodic", confidence: 0.8, version: 2, supersedes: "old.json", validFrom: "2024-01-01T00:00:00Z" });
    expect(episode?.content).not.toContain("episodic");
    expect(legacy?.metadata).toBeUndefined();
  });

  it("PersonaRAG searches JSON content from a temp persona directory", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { name: "Ari", role: "TypeScript engineer" });
    writeJson(join(dir, "communication.json"), { style: "direct", language: "en" });
    const rag = new PersonaRAG(dir);

    const results = rag.search("typescript engineer", 1);

    expect(results[0]?.file.path).toBe("identity.json");
    expect(rag.getStats().files).toBe(2);
  });
});

describe("export/import", () => {
  it("exports all JSON persona files with portable relative paths", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { name: "Ari" });
    const nested = join(dir, "taste");
    createFromTemplate("minimal", nested);
    const output = join(tempDir(), "persona-export.json");

    const result = exportPersona(dir, output);
    const payload = readJson<{ files: Array<{ path: string }> }>(output);

    expect(result.files).toBe(3);
    expect(payload.files.map((file) => file.path)).toEqual([
      "identity.json",
      "taste/communication.json",
      "taste/identity.json",
    ]);
  });

  it("creates the export output directory when missing", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { name: "Ari" });
    const output = join(tempDir(), "nested", "persona.json");

    const result = exportPersona(dir, output);

    expect(result.path).toBe(output);
    expect(readJson<{ version: number }>(output).version).toBe(1);
  });

  it("imports exported files into an empty target directory", () => {
    const source = tempDir();
    const target = tempDir();
    writeJson(join(source, "identity.json"), { name: "Ari" });
    const output = join(tempDir(), "persona.json");
    exportPersona(source, output);

    const result = importPersona(output, target);

    expect(result).toMatchObject({ files: 1, added: 1, updated: 0, skipped: 0 });
    expect(readJson<{ name: string }>(join(target, "identity.json")).name).toBe("Ari");
  });

  it("skips existing files by default during import", () => {
    const source = tempDir();
    const target = tempDir();
    writeJson(join(source, "identity.json"), { name: "Incoming" });
    writeJson(join(target, "identity.json"), { name: "Current" });
    const output = join(tempDir(), "persona.json");
    exportPersona(source, output);

    const result = importPersona(output, target);

    expect(result).toMatchObject({ added: 0, updated: 0, skipped: 1 });
    expect(readJson<{ name: string }>(join(target, "identity.json")).name).toBe("Current");
  });

  it("overwrites existing files when requested", () => {
    const source = tempDir();
    const target = tempDir();
    writeJson(join(source, "identity.json"), { name: "Incoming" });
    writeJson(join(target, "identity.json"), { name: "Current" });
    const output = join(tempDir(), "persona.json");
    exportPersona(source, output);

    const result = importPersona(output, target, { onConflict: "overwrite" });

    expect(result).toMatchObject({ added: 0, updated: 1, skipped: 0 });
    expect(readJson<{ name: string }>(join(target, "identity.json")).name).toBe("Incoming");
  });

  it("merges nested JSON objects on import conflict", () => {
    const source = tempDir();
    const target = tempDir();
    writeJson(join(source, "preferences.json"), { ui: { density: "compact" } });
    writeJson(join(target, "preferences.json"), { ui: { theme: "dark" }, locale: "en" });
    const output = join(tempDir(), "persona.json");
    exportPersona(source, output);

    const result = importPersona(output, target, { onConflict: "merge" });

    expect(result.updated).toBe(1);
    expect(readJson<unknown>(join(target, "preferences.json"))).toEqual({
      ui: { theme: "dark", density: "compact" },
      locale: "en",
    });
  });

  it("rejects import files with unsafe paths", () => {
    const input = join(tempDir(), "bad-export.json");
    writeJson(input, {
      version: 1,
      timestamp: new Date().toISOString(),
      files: [{ path: "../escape.json", data: { bad: true } }],
    });

    expect(() => importPersona(input, tempDir())).toThrow(/Invalid file path/);
  });
});

describe("offline consolidation", () => {
  it("previews bounded merge resolutions without writing", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { style: "calm" });
    writeJson(join(dir, "taste.json"), { style: "minimal" });
    const result = consolidatePersona(dir, { maxConflicts: 1 });
    expect(result.dryRun).toBe(true);
    expect(result.resolved).toBe(1);
    expect(result.applied).toBe(0);
    expect(readJson<{ style: string }>(join(dir, "identity.json")).style).toBe("calm");
  });

  it("applies only when explicitly requested", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { style: "calm" });
    writeJson(join(dir, "taste.json"), { style: "minimal" });
    const result = consolidatePersona(dir, { strategy: "prefer-source", apply: true });
    expect(result.dryRun).toBe(false);
    expect(result.applied).toBe(1);
    expect(readJson<{ style: string }>(join(dir, "identity.json")).style).toBe("calm");
  });
});

describe("conflict resolution", () => {
  it("detects fields with conflicting scalar values across files", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { role: "Engineer" });
    writeJson(join(dir, "profile.json"), { role: "Manager" });

    const conflicts = new ConflictResolver(dir).scanConflicts();

    expect(conflicts).toEqual([
      {
        field: "role",
        values: [
          { source: "identity.json", value: "Engineer" },
          { source: "profile.json", value: "Manager" },
        ],
      },
    ]);
  });

  it("does not report identical values as conflicts", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { language: "en" });
    writeJson(join(dir, "communication.json"), { language: "en" });

    expect(new ConflictResolver(dir).scanConflicts()).toEqual([]);
  });

  it("resolves latest conflicts by descending source name", () => {
    const conflict = { field: "role", values: [{ source: "a.json", value: "old" }, { source: "z.json", value: "new" }] };

    const result = new ConflictResolver(tempDir()).autoResolve([conflict], "latest");

    expect(result.resolved).toBe(1);
    expect(result.conflicts[0].resolution).toBe("new");
  });

  it("resolves merge conflicts by preserving all values", () => {
    const conflict = { field: "style", values: [{ source: "a.json", value: "direct" }, { source: "b.json", value: "warm" }] };

    const result = new ConflictResolver(tempDir()).autoResolve([conflict], "merge");

    expect(result.conflicts[0].resolution).toEqual(["direct", "warm"]);
  });

  it("prefers identity.json when using prefer-source strategy", () => {
    const conflict = {
      field: "role",
      values: [{ source: "profile.json", value: "Manager" }, { source: "identity.json", value: "Engineer" }],
    };

    const result = new ConflictResolver(tempDir()).autoResolve([conflict], "prefer-source");

    expect(result.conflicts[0].resolution).toBe("Engineer");
  });

  it("marks conflicts manual without assigning a resolution", () => {
    const conflict = { field: "role", values: [{ source: "a.json", value: "old" }, { source: "b.json", value: "new" }] };

    const result = new ConflictResolver(tempDir()).autoResolve([conflict], "manual");

    expect(result).toMatchObject({ resolved: 0, manual: 1 });
    expect(result.conflicts[0].resolution).toBeUndefined();
  });

  it("applies a resolved nested value to the mapped persona file", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { name: "Old", role: "Engineer" });

    const applied = new ConflictResolver(dir).applyResolutions(new Map([["identity.name", "New"]]));

    expect(applied).toBe(1);
    expect(readJson<{ name: string }>(join(dir, "identity.json")).name).toBe("New");
  });
});

describe("templates", () => {
  it("lists all built-in templates with file counts", () => {
    const templates = listTemplates();

    expect(templates.map((template) => template.name)).toEqual(["minimal", "developer", "creator", "manager"]);
    expect(templates.find((template) => template.name === "developer")?.fileCount).toBe(4);
  });

  it("creates a minimal persona template", () => {
    const dir = tempDir();

    const result = createFromTemplate("minimal", dir);

    expect(result.filesCreated).toBe(2);
    expect(readJson<{ role: string }>(join(dir, "identity.json")).role).toBe("Your Role");
    expect(readJson<{ style: string }>(join(dir, "communication.json")).style).toBe("direct");
  });

  it("creates nested files for the developer template", () => {
    const dir = tempDir();

    const result = createFromTemplate("developer", dir);

    expect(result.filesCreated).toBe(Object.keys(PERSONA_TEMPLATES.developer.files).length);
    expect(readJson<{ language: string }>(join(dir, "taste", "software.json")).language).toBe("TypeScript");
    expect(readJson<{ primary: string }>(join(dir, "technical", "domains.json")).primary).toBe("web");
  });

  it("does not overwrite existing template files", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { name: "Existing" });

    const result = createFromTemplate("minimal", dir, { name: "Custom" });

    expect(result.filesCreated).toBe(1);
    expect(readJson<{ name: string }>(join(dir, "identity.json")).name).toBe("Existing");
  });

  it("applies custom data to newly created template files", () => {
    const dir = tempDir();

    createFromTemplate("minimal", dir, { name: "Ari", location: "Bangkok" });

    expect(readJson<{ name: string; location: string }>(join(dir, "identity.json"))).toMatchObject({
      name: "Ari",
      location: "Bangkok",
    });
  });

  it("throws for unknown templates and includes available names", () => {
    expect(() => createFromTemplate("missing", tempDir())).toThrow(/Available: minimal, developer, creator, manager/);
  });
});

describe("validation", () => {
  it("fails validation for a missing data directory", () => {
    const result = validatePersona(join(tempDir(), "missing"));

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Data directory does not exist/);
  });

  it("warns but remains valid for an empty directory", () => {
    const result = validatePersona(tempDir());

    expect(result.valid).toBe(true);
    expect(result.warnings[0]).toMatch(/No JSON persona files found/);
  });

  it("accepts valid JSON persona files", () => {
    const dir = tempDir();
    writeJson(join(dir, "identity.json"), { name: "Ari" });

    const result = validatePersona(dir);

    expect(result).toMatchObject({ valid: true, files: 1, errors: [] });
  });

  it("reports invalid JSON files", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "broken.json"), "{ broken", "utf-8");

    const result = validatePersona(dir);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid JSON in broken\.json/);
  });

  it("reports empty JSON files", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "empty.json"), "  \n", "utf-8");

    const result = validatePersona(dir);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toBe("Empty JSON file: empty.json");
  });

  it("warns about primitive JSON persona files", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "primitive.json"), "\"hello\"\n", "utf-8");

    const result = validatePersona(dir);

    expect(result.valid).toBe(true);
    expect(result.warnings[0]).toBe("Persona file contains primitive JSON: primitive.json");
  });
});
