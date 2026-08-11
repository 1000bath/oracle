#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import type { Interface } from "node:readline";
import { Oracle } from "./oracle.js";
import { PersonaRAG } from "./rag.js";
import {
  exportPersona,
  importPersona,
  validatePersona,
  type ImportOptions,
} from "./export-import.js";

type OutputFormat = "text" | "json";

interface CommandContext {
  oracle: Oracle;
  personaDir: string;
  format: OutputFormat;
  topK: number;
  interactive: boolean;
}

interface ParsedInput {
  command: string;
  args: string[];
  options: Map<string, string | boolean>;
}

type CommandHandler = (input: ParsedInput, context: CommandContext) => Promise<boolean> | boolean;
type HistoryInterface = Interface & { history: string[] };

interface CommandDefinition {
  summary: string;
  usage: string;
  handler: CommandHandler;
}

const COMMAND_NAMES = [
  "search",
  "consult",
  "taste",
  "decide",
  "stats",
  "list",
  "export",
  "import",
  "validate",
  "help",
  "clear",
  "exit",
] as const;

const HISTORY_FILE = join(PersonaRAG.defaultDir(), ".oracle_history");
const colorEnabled = process.stdout.isTTY && !process.env.NO_COLOR;

const colors = {
  bold: style("\x1b[1m"),
  dim: style("\x1b[2m"),
  red: style("\x1b[31m"),
  green: style("\x1b[32m"),
  yellow: style("\x1b[33m"),
  blue: style("\x1b[34m"),
  magenta: style("\x1b[35m"),
  cyan: style("\x1b[36m"),
};

const commands: Record<string, CommandDefinition> = {
  search: {
    summary: "Search persona data",
    usage: "search <query> [--top <n>] [--format text|json]",
    handler: (input, context) => {
      const query = requiredText(input.args, "search requires a query");
      const topK = readNumberOption(input, "top", context.topK);
      const format = readFormatOption(input, context.format);
      const results = context.oracle.search(query, topK);

      if (format === "json") {
        printJson(results);
        return true;
      }

      if (results.length === 0) {
        printInfo("No matching persona data found.");
        return true;
      }

      for (const result of results) {
        console.log(`${colors.cyan(result.file.path)} ${colors.dim(`score ${result.score.toFixed(3)}`)}`);
        console.log(result.excerpt);
        console.log("");
      }
      return true;
    },
  },
  consult: {
    summary: "Consult persona data about a topic",
    usage: "consult <topic> [context] [--format text|json]",
    handler: (input, context) => {
      const topic = input.args[0];
      if (!topic) throw new Error("consult requires a topic");
      const extraContext = input.args.slice(1).join(" ") || undefined;
      const format = readFormatOption(input, context.format);
      const result = context.oracle.consult(topic, extraContext);

      if (format === "json") {
        printJson(result);
        return true;
      }

      console.log(colors.bold(result.topic));
      console.log("");
      console.log(result.answer || "No data found.");
      if (result.sources.length > 0) {
        console.log("");
        console.log(`${colors.dim("Sources:")} ${result.sources.join(", ")}`);
      }
      return true;
    },
  },
  taste: {
    summary: "Look up taste or preference data",
    usage: "taste <area> [--format text|json]",
    handler: (input, context) => {
      const area = requiredText(input.args, "taste requires an area");
      const format = readFormatOption(input, context.format);
      const result = context.oracle.taste(area);

      if (format === "json") {
        printJson(result);
        return true;
      }

      console.log(result.preferences || "No data found.");
      if (result.source) console.log(`\n${colors.dim(`Source: ${result.source}`)}`);
      return true;
    },
  },
  decide: {
    summary: "Consult decision data",
    usage: "decide <decision> [option ...] [--format text|json]",
    handler: (input, context) => {
      const decision = input.args[0];
      if (!decision) throw new Error("decide requires a decision");
      const options = input.args.slice(1);
      const format = readFormatOption(input, context.format);
      const result = context.oracle.decide(decision, options);

      if (format === "json") {
        printJson(result);
        return true;
      }

      console.log(result.analysis || "No data found.");
      if (result.sources.length > 0) {
        console.log("");
        console.log(`${colors.dim("Sources:")} ${result.sources.join(", ")}`);
      }
      return true;
    },
  },
  stats: {
    summary: "Show persona statistics",
    usage: "stats [--format text|json]",
    handler: (input, context) => {
      const stats = context.oracle.stats();
      const format = readFormatOption(input, context.format);

      if (format === "json") {
        printJson({ ...stats, dir: context.personaDir });
        return true;
      }

      console.log(colors.bold("Persona Statistics"));
      console.log(`  Files: ${colors.green(String(stats.files))}`);
      console.log(`  Terms: ${colors.green(String(stats.terms))}`);
      console.log(`  Categories: ${stats.categories.join(", ") || "none"}`);
      console.log(`  Directory: ${context.personaDir}`);
      return true;
    },
  },
  list: {
    summary: "List persona files",
    usage: "list [--format text|json]",
    handler: (input, context) => {
      const files = context.oracle.files();
      const format = readFormatOption(input, context.format);

      if (format === "json") {
        printJson(files);
        return true;
      }

      if (files.length === 0) {
        printInfo("No persona files found.");
        return true;
      }

      console.log(colors.bold(`Persona Files (${files.length})`));
      for (const file of files) {
        console.log(`  ${colors.cyan(file.path)} ${colors.dim(file.category)} ${file.title}`);
      }
      return true;
    },
  },
  export: {
    summary: "Export persona data",
    usage: "export [file] [--format text|json]",
    handler: (input, context) => {
      const outputFile = expandPath(input.args[0] ?? "persona-export.json");
      const format = readFormatOption(input, context.format);
      const result = exportPersona(context.personaDir, outputFile);

      if (format === "json") {
        printJson(result);
        return true;
      }

      printSuccess(`Exported ${result.files} files to ${result.path}`);
      return true;
    },
  },
  import: {
    summary: "Import persona data",
    usage: "import <file> [--on-conflict skip|overwrite|merge] [--format text|json]",
    handler: (input, context) => {
      const inputFile = input.args[0];
      if (!inputFile) throw new Error("import requires a file path");
      const format = readFormatOption(input, context.format);
      const onConflict = readConflictOption(input);
      const result = importPersona(expandPath(inputFile), context.personaDir, { onConflict });

      if (format === "json") {
        printJson(result);
        return true;
      }

      printSuccess(
        `Imported ${result.files} files (${result.added} added, ${result.updated} updated, ${result.skipped} skipped)`,
      );
      return true;
    },
  },
  validate: {
    summary: "Validate persona data integrity",
    usage: "validate [--format text|json]",
    handler: (input, context) => {
      const format = readFormatOption(input, context.format);
      const result = validatePersona(context.personaDir);

      if (format === "json") {
        printJson(result);
        return true;
      }

      console.log(colors.bold("Validation Results"));
      console.log(`  Valid: ${result.valid ? colors.green("yes") : colors.red("no")}`);
      console.log(`  Files: ${result.files}`);
      console.log(`  Errors: ${result.errors.length}`);
      console.log(`  Warnings: ${result.warnings.length}`);
      printMessages("Errors", result.errors, colors.red);
      printMessages("Warnings", result.warnings, colors.yellow);
      return true;
    },
  },
  help: {
    summary: "Show help",
    usage: "help [command]",
    handler: (input) => {
      printHelp(input.args[0]);
      return true;
    },
  },
  clear: {
    summary: "Clear the terminal",
    usage: "clear",
    handler: () => {
      process.stdout.write("\x1Bc");
      return true;
    },
  },
  exit: {
    summary: "Exit interactive mode",
    usage: "exit",
    handler: () => false,
  },
};

async function main(): Promise<void> {
  const parsed = parseInput(process.argv.slice(2));
  const personaDir = expandPath(readStringOption(parsed, "persona-dir", PersonaRAG.defaultDir()));
  const context: CommandContext = {
    oracle: new Oracle({ personaDir }),
    personaDir,
    format: readFormatOption(parsed, "text"),
    topK: readNumberOption(parsed, "top", 5),
    interactive: false,
  };

  if (!parsed.command || parsed.command === "interactive" || parsed.options.has("interactive")) {
    await runInteractive(context);
    return;
  }

  const shouldContinue = await runCommand(parsed, context);
  if (!shouldContinue) return;
}

async function runInteractive(context: CommandContext): Promise<void> {
  context.interactive = true;
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: colors.magenta("oracle> "),
    completer,
    history: readHistory(),
    removeHistoryDuplicates: true,
  }) as HistoryInterface;

  console.log(colors.bold("Oracle enhanced CLI"));
  console.log(colors.dim("Type help for commands, exit to quit."));
  rl.prompt();

  for await (const line of rl) {
    const parsed = parseInput(splitArgs(line));
    if (!parsed.command) {
      rl.prompt();
      continue;
    }

    try {
      const shouldContinue = await runCommand(parsed, context);
      if (!shouldContinue) break;
    } catch (error) {
      printError(formatError(error));
    }

    rl.prompt();
  }

  writeHistory(rl.history);
  rl.close();
}

async function runCommand(input: ParsedInput, context: CommandContext): Promise<boolean> {
  const commandName = normalizeCommand(input.command);
  const command = commands[commandName];

  if (!command) {
    printError(`Unknown command: ${input.command}`);
    printInfo("Type help to see available commands.");
    return true;
  }

  return command.handler({ ...input, command: commandName }, context);
}

function printHelp(commandName?: string): void {
  if (commandName) {
    const command = commands[normalizeCommand(commandName)];
    if (!command) {
      printError(`Unknown command: ${commandName}`);
      return;
    }
    console.log(`${colors.bold(commandName)} - ${command.summary}`);
    console.log(`Usage: ${command.usage}`);
    return;
  }

  console.log(`
${colors.bold("Oracle enhanced CLI")}

Usage:
  oracle-enhanced [command] [options]
  oracle-enhanced

Commands:
${Object.entries(commands)
  .map(([name, command]) => `  ${colors.cyan(name.padEnd(10))} ${command.summary}`)
  .join("\n")}

Global options:
  --persona-dir <dir>       Persona directory (default: ~/.oracleai)
  --top <n>                 Number of search results (default: 5)
  --format text|json        Output format (default: text)
  --interactive             Start interactive mode
  --help                    Show help

Examples:
  oracle-enhanced search "TypeScript zero dependencies"
  oracle-enhanced consult "choosing a database"
  oracle-enhanced import backup.json --on-conflict merge
`);
}

function parseInput(parts: string[]): ParsedInput {
  const args = [...parts];
  const options = new Map<string, string | boolean>();

  if (args.includes("--help") || args.includes("-h")) {
    return { command: "help", args: [], options };
  }

  const command = args.shift() ?? "";
  const positional: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        options.set(key, next);
        i += 1;
      } else {
        options.set(key, true);
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, args: positional, options };
}

function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if ((char === "'" || char === "\"") && quote === null) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (/\s/.test(char) && quote === null) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

function completer(line: string): [string[], string] {
  const parts = splitArgs(line);
  const last = parts.at(-1) ?? "";

  if (parts.length <= 1 && !line.endsWith(" ")) {
    const hits = COMMAND_NAMES.filter((command) => command.startsWith(last));
    return [hits.length > 0 ? hits : [...COMMAND_NAMES], last];
  }

  const optionNames = [
    "--format",
    "--top",
    "--persona-dir",
    "--on-conflict",
    "--interactive",
    "--help",
  ];
  const hits = optionNames.filter((option) => option.startsWith(last));
  return [hits, last];
}

function readHistory(): string[] {
  if (!existsSync(HISTORY_FILE)) return [];
  return readFileSync(HISTORY_FILE, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function writeHistory(history: readonly string[]): void {
  const lines = [...history].reverse().slice(-100);
  writeFileSync(HISTORY_FILE, `${lines.join("\n")}\n`, "utf-8");
}

function normalizeCommand(command: string): string {
  if (command === "quit" || command === "q") return "exit";
  if (command === "?") return "help";
  return command;
}

function readStringOption(input: ParsedInput, name: string, fallback: string): string {
  const value = input.options.get(name);
  return typeof value === "string" ? value : fallback;
}

function readNumberOption(input: ParsedInput, name: string, fallback: number): number {
  const value = input.options.get(name);
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return parsed;
}

function readFormatOption(input: ParsedInput, fallback: OutputFormat): OutputFormat {
  const value = input.options.get("format");
  if (value === undefined || value === true) return fallback;
  if (value !== "text" && value !== "json") {
    throw new Error("--format must be text or json");
  }
  return value;
}

function readConflictOption(input: ParsedInput): ImportOptions["onConflict"] {
  const value = input.options.get("on-conflict");
  if (value === undefined || value === true) return "skip";
  if (value !== "skip" && value !== "overwrite" && value !== "merge") {
    throw new Error("--on-conflict must be skip, overwrite, or merge");
  }
  return value;
}

function requiredText(args: string[], message: string): string {
  const text = args.join(" ").trim();
  if (!text) throw new Error(message);
  return text;
}

function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printSuccess(message: string): void {
  console.log(`${colors.green("OK")} ${message}`);
}

function printInfo(message: string): void {
  console.log(`${colors.blue("Info")} ${message}`);
}

function printError(message: string): void {
  console.error(`${colors.red("Error")} ${message}`);
}

function printMessages(label: string, messages: string[], color: (value: string) => string): void {
  if (messages.length === 0) return;
  console.log("");
  console.log(color(label));
  for (const message of messages) {
    console.log(`  - ${message}`);
  }
}

function style(open: string): (value: string) => string {
  return (value) => (colorEnabled ? `${open}${value}\x1b[0m` : value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  printError(formatError(error));
  process.exit(1);
});
