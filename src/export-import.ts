import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  sep,
} from "node:path";

export interface ExportResult {
  files: number;
  path: string;
  timestamp: string;
}

export interface ImportOptions {
  onConflict: "skip" | "overwrite" | "merge";
}

export interface ImportResult {
  files: number;
  added: number;
  updated: number;
  skipped: number;
}

export interface ValidationResult {
  valid: boolean;
  files: number;
  errors: string[];
  warnings: string[];
}

interface ExportedPersonaFile {
  path: string;
  data: unknown;
}

interface PersonaExport {
  version: 1;
  timestamp: string;
  files: ExportedPersonaFile[];
}

const DEFAULT_IMPORT_OPTIONS: ImportOptions = { onConflict: "skip" };

export function exportPersona(dataDir: string, outputFile: string): ExportResult {
  const validation = validatePersona(dataDir);
  if (!validation.valid) {
    throw new Error(`Cannot export invalid persona data: ${validation.errors.join("; ")}`);
  }

  const files = listJsonFiles(dataDir).map((file) => ({
    path: toPortablePath(relative(dataDir, file)),
    data: readJsonFile(file),
  }));
  const timestamp = new Date().toISOString();
  const payload: PersonaExport = {
    version: 1,
    timestamp,
    files,
  };

  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${stringifyJson(payload)}\n`, "utf-8");

  return {
    files: files.length,
    path: outputFile,
    timestamp,
  };
}

export function importPersona(
  inputFile: string,
  dataDir: string,
  options?: ImportOptions,
): ImportResult {
  const importOptions = options ?? DEFAULT_IMPORT_OPTIONS;
  validateImportOptions(importOptions);
  const payload = readExportFile(inputFile);
  const result: ImportResult = {
    files: payload.files.length,
    added: 0,
    updated: 0,
    skipped: 0,
  };

  mkdirSync(dataDir, { recursive: true });

  for (const file of payload.files) {
    const target = resolveSafeTarget(dataDir, file.path);
    const exists = existsSync(target);

    if (exists && importOptions.onConflict === "skip") {
      result.skipped += 1;
      continue;
    }

    let nextData = file.data;
    if (exists && importOptions.onConflict === "merge") {
      const currentData = readJsonFile(target);
      nextData = mergeJson(currentData, file.data);
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${stringifyJson(nextData)}\n`, "utf-8");

    if (exists) {
      result.updated += 1;
    } else {
      result.added += 1;
    }
  }

  return result;
}

export function validatePersona(dataDir: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    files: 0,
    errors: [],
    warnings: [],
  };

  if (!existsSync(dataDir)) {
    result.valid = false;
    result.errors.push(`Data directory does not exist: ${dataDir}`);
    return result;
  }

  const stat = statSync(dataDir);
  if (!stat.isDirectory()) {
    result.valid = false;
    result.errors.push(`Data path is not a directory: ${dataDir}`);
    return result;
  }

  const files = listJsonFiles(dataDir);
  result.files = files.length;

  if (files.length === 0) {
    result.warnings.push(`No JSON persona files found in: ${dataDir}`);
  }

  for (const file of files) {
    const relPath = toPortablePath(relative(dataDir, file));
    if (!isSafeRelativePath(relPath)) {
      result.errors.push(`Unsafe file path: ${relPath}`);
      continue;
    }

    const raw = readFileSync(file, "utf-8");
    if (raw.trim().length === 0) {
      result.errors.push(`Empty JSON file: ${relPath}`);
      continue;
    }

    try {
      const data: unknown = JSON.parse(raw);
      if (!isContainerJson(data)) {
        result.warnings.push(`Persona file contains primitive JSON: ${relPath}`);
      }
    } catch (error) {
      result.errors.push(`Invalid JSON in ${relPath}: ${formatError(error)}`);
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

function listJsonFiles(dataDir: string): string[] {
  if (!existsSync(dataDir)) return [];

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
        files.push(fullPath);
      }
    }
  };

  walk(dataDir);
  return files.sort();
}

function readExportFile(inputFile: string): PersonaExport {
  const data: unknown = readJsonFile(inputFile);
  if (!isRecord(data)) {
    throw new Error("Import file must contain a JSON object");
  }

  if (data.version !== 1) {
    throw new Error("Unsupported persona export version");
  }

  if (typeof data.timestamp !== "string") {
    throw new Error("Import file is missing a valid timestamp");
  }

  if (!Array.isArray(data.files)) {
    throw new Error("Import file is missing a files array");
  }

  const files = data.files.map((file, index): ExportedPersonaFile => {
    if (!isRecord(file)) {
      throw new Error(`Invalid file entry at index ${index}`);
    }

    if (typeof file.path !== "string" || !isSafeRelativePath(file.path)) {
      throw new Error(`Invalid file path at index ${index}`);
    }

    if (extname(file.path).toLowerCase() !== ".json") {
      throw new Error(`Imported file is not JSON: ${file.path}`);
    }

    if (!Object.prototype.hasOwnProperty.call(file, "data")) {
      throw new Error(`Imported file entry is missing data: ${file.path}`);
    }

    return {
      path: file.path,
      data: file.data,
    };
  });

  return {
    version: 1,
    timestamp: data.timestamp,
    files,
  };
}

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch (error) {
    throw new Error(`Failed to read JSON file ${file}: ${formatError(error)}`);
  }
}

function validateImportOptions(options: ImportOptions): void {
  if (
    options.onConflict !== "skip" &&
    options.onConflict !== "overwrite" &&
    options.onConflict !== "merge"
  ) {
    throw new Error(`Unsupported conflict option: ${String(options.onConflict)}`);
  }
}

function stringifyJson(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  if (json === undefined) {
    throw new Error("Cannot write undefined JSON data");
  }

  return json;
}

function resolveSafeTarget(dataDir: string, relPath: string): string {
  if (!isSafeRelativePath(relPath)) {
    throw new Error(`Unsafe import path: ${relPath}`);
  }

  const target = normalize(join(dataDir, relPath));
  const normalizedDataDir = normalize(dataDir);
  if (target !== normalizedDataDir && !target.startsWith(`${normalizedDataDir}${sep}`)) {
    throw new Error(`Import path escapes data directory: ${relPath}`);
  }

  return target;
}

function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.includes("\0") || isAbsolute(value)) {
    return false;
  }

  const normalized = normalize(value);
  return normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

function mergeJson(current: unknown, incoming: unknown): unknown {
  if (!isRecord(current) || !isRecord(incoming)) {
    return incoming;
  }

  const merged: Record<string, unknown> = { ...current };
  for (const [key, incomingValue] of Object.entries(incoming)) {
    const currentValue = merged[key];
    merged[key] = mergeJson(currentValue, incomingValue);
  }

  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContainerJson(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function toPortablePath(value: string): string {
  return value.split(sep).join("/");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
