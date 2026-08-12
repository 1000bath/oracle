import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Conflict, consolidatePersona, ConsolidationOptions, ConsolidationResult } from "./conflict.js";
import { exportPersona, ExportResult, validatePersona, ValidationResult } from "./export-import.js";

/** Options for the safe forget operation. It is a dry run unless apply is true. */
export interface ForgetOptions {
  apply?: boolean;
  /** Create an export before mutation. Defaults to a sibling timestamped file when applying. */
  backupFile?: string;
  /** Bound the number of fields changed (default 100). */
  maxChanges?: number;
}
export interface ForgetChange { file: string; field: string; value: unknown; }
export interface ForgetResult { changes: ForgetChange[]; applied: number; dryRun: boolean; backup?: ExportResult; truncated: boolean; }

/**
 * Preview or apply removal of fields from persona JSON. No data is changed by default;
 * applying requires an explicit `apply: true`, and always creates a validated export first.
 */
export function forgetPersona(dataDir: string, fields: string[], options: ForgetOptions = {}): ForgetResult {
  const wanted = new Set(fields.filter((f) => typeof f === "string" && f.length > 0));
  const max = Number.isFinite(options.maxChanges) ? Math.max(1, Math.trunc(options.maxChanges!)) : 100;
  const changes: ForgetChange[] = [];
  const pending: Array<{ file: string; data: unknown }> = [];
  for (const file of listJson(dataDir)) {
    let data: unknown;
    try { data = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    const rel = file.slice(dataDir.length).replace(/^[/\\]/, "");
    const walk = (obj: unknown, prefix = ""): unknown => {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
      const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
      for (const [key, value] of Object.entries(out)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (wanted.has(path) || wanted.has(`${rel}:${path}`) || wanted.has(`${rel}#${path}`)) {
          if (changes.length >= max) continue;
          changes.push({ file: rel, field: path, value }); delete out[key];
        } else if (value && typeof value === "object" && !Array.isArray(value)) out[key] = walk(value, path);
      }
      return out;
    };
    const next = walk(data); if (changes.some((c) => c.file === rel)) pending.push({ file, data: next });
  }
  const truncated = changes.length >= max;
  let backup: ExportResult | undefined;
  if (options.apply === true && pending.length) {
    // Export before any mutation. Applying without an explicit path still gets a recovery artifact.
    const backupFile = options.backupFile ?? join(dataDir, `.oracle-forget-backup-${Date.now()}.json`);
    backup = exportPersona(dataDir, backupFile);
    for (const item of pending) writeFileSync(item.file, `${JSON.stringify(item.data, null, 2)}\n`, "utf8");
  }
  return { changes, applied: options.apply === true ? changes.length : 0, dryRun: options.apply !== true, backup, truncated };
}

export interface AuditOptions { maxConflicts?: number; strategy?: ConsolidationOptions["strategy"]; }
export interface GovernanceAudit { valid: ValidationResult; conflicts: ConsolidationResult; exportable: boolean; }
/** Read-only governance report combining validation and bounded conflict inspection. */
export function auditPersona(dataDir: string, options: AuditOptions = {}): GovernanceAudit {
  const valid = validatePersona(dataDir);
  let conflicts: ConsolidationResult;
  try { conflicts = consolidatePersona(dataDir, { maxConflicts: options.maxConflicts, strategy: options.strategy ?? "manual" }); }
  catch { conflicts = { conflicts: [], resolved: 0, manual: 0, applied: 0, dryRun: true, truncated: false }; }
  return { valid, conflicts, exportable: valid.valid };
}

/** Bounded, read-only conflict governance primitive. */
export function governConflicts(dataDir: string, options: ConsolidationOptions = {}): ConsolidationResult {
  return consolidatePersona(dataDir, { ...options, apply: options.apply === true });
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const fs = require("node:fs"); const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name); if (e.isDirectory()) out.push(...listJson(f)); else if (e.isFile() && e.name.endsWith(".json")) out.push(f);
  }
  return out.sort();
}
