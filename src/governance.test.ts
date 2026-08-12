import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditPersona, forgetPersona } from "./governance.js";

const dir = () => mkdtempSync(join(tmpdir(), "oracle-governance-"));

describe("governance primitives", () => {
  it("previews forgetting without changing data", () => {
    const root = dir(); writeFileSync(join(root, "identity.json"), JSON.stringify({ contact: { email: "x", name: "N" } }));
    const result = forgetPersona(root, ["contact.email"]);
    expect(result.dryRun).toBe(true); expect(result.applied).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "identity.json"), "utf8")).contact.email).toBe("x");
  });
  it("backs up before applying forget", () => {
    const root = dir(); const backup = join(root, "backup.json");
    writeFileSync(join(root, "identity.json"), JSON.stringify({ secret: "x", keep: true }));
    const result = forgetPersona(root, ["secret"], { apply: true, backupFile: backup });
    expect(result.applied).toBe(1); expect(result.backup?.files).toBe(1);
    expect(JSON.parse(readFileSync(join(root, "identity.json"), "utf8"))).toEqual({ keep: true });
    expect(JSON.parse(readFileSync(backup, "utf8")).files[0].data).toEqual({ secret: "x", keep: true });
  });
  it("audits invalid data without throwing", () => {
    const root = dir(); writeFileSync(join(root, "bad.json"), "not json");
    const result = auditPersona(root); expect(result.exportable).toBe(false); expect(result.valid.valid).toBe(false);
  });
});
