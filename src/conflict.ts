import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Conflict resolution for persona data.
 * Handles conflicting information across persona files.
 */
export interface Conflict {
  field: string;
  values: Array<{ source: string; value: unknown }>;
  resolution?: unknown;
}

export interface ConflictResolution {
  conflicts: Conflict[];
  resolved: number;
  manual: number;
}

export type ResolutionStrategy = "latest" | "merge" | "prefer-source" | "manual";

/**
 * Detect and resolve conflicts in persona data.
 */
export class ConflictResolver {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /** Scan all persona files for conflicts */
  scanConflicts(): Conflict[] {
    const conflicts: Conflict[] = [];
    const fieldSources = new Map<string, Array<{ source: string; value: unknown }>>();

    // Collect all fields from all files
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      const fs = require("node:fs");
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".json")) {
          try {
            const content = readFileSync(full, "utf-8");
            const data = JSON.parse(content);
            this.collectFields(data, entry.name, fieldSources);
          } catch { /* skip */ }
        }
      }
    };

    walk(this.dataDir);

    // Find conflicts (same field, different values)
    for (const [field, sources] of fieldSources) {
      const uniqueValues = new Set(sources.map((s) => JSON.stringify(s.value)));
      if (uniqueValues.size > 1) {
        conflicts.push({ field, values: sources });
      }
    }

    return conflicts;
  }

  private collectFields(
    obj: unknown,
    source: string,
    fieldSources: Map<string, Array<{ source: string; value: unknown }>>,
    prefix: string = ""
  ): void {
    if (typeof obj !== "object" || obj === null) return;

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const field = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        this.collectFields(value, source, fieldSources, field);
      } else {
        const existing = fieldSources.get(field) ?? [];
        existing.push({ source, value });
        fieldSources.set(field, existing);
      }
    }
  }

  /** Auto-resolve conflicts using a strategy */
  autoResolve(conflicts: Conflict[], strategy: ResolutionStrategy): ConflictResolution {
    const result: ConflictResolution = { conflicts, resolved: 0, manual: 0 };

    for (const conflict of conflicts) {
      switch (strategy) {
        case "latest": {
          // Use most recent file (by name sorting)
          const sorted = [...conflict.values].sort((a, b) => b.source.localeCompare(a.source));
          conflict.resolution = sorted[0]?.value;
          result.resolved++;
          break;
        }
        case "merge": {
          // Merge all values into an array
          conflict.resolution = conflict.values.map((v) => v.value);
          result.resolved++;
          break;
        }
        case "prefer-source": {
          // Use first source (typically identity.json)
          const preferred = conflict.values.find((v) => v.source === "identity.json");
          if (preferred) {
            conflict.resolution = preferred.value;
            result.resolved++;
          } else {
            conflict.resolution = conflict.values[0]?.value;
            result.resolved++;
          }
          break;
        }
        case "manual": {
          result.manual++;
          break;
        }
      }
    }

    return result;
  }

  /** Apply resolutions to files */
  applyResolutions(resolutions: Map<string, unknown>): number {
    let applied = 0;

    for (const [field, value] of resolutions) {
      // Find and update the file containing this field
      const parts = field.split(".");
      const fileName = parts[0] + ".json";
      const filePath = join(this.dataDir, fileName);

      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);

          // Set nested value
          let current = data;
          for (let i = 1; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = value;

          writeFileSync(filePath, JSON.stringify(data, null, 2));
          applied++;
        } catch { /* skip */ }
      }
    }

    return applied;
  }
}
