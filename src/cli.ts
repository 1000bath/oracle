#!/usr/bin/env node

import { Oracle } from "./oracle.js";
import { PersonaRAG } from "./rag.js";
import { existsSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { exportPersona, importPersona, validatePersona } from "./export-import.js";
import { askWithPersona, type OracleMemoryPort } from "./ask.js";

async function loadMemoryBackend(rootDir: string): Promise<OracleMemoryPort | undefined> {
  const memoryRoot = process.env.DEK_MEMORY_ROOT ?? join(rootDir, "memory");
  const modulePath = join(memoryRoot, "dist", "adapter.js");
  if (!existsSync(modulePath)) return undefined;
  mkdirSync(join(rootDir, ".oracle-memory"), { recursive: true });
  const { MemoryAdapter } = await import(pathToFileURL(modulePath).href);
  const backend = new MemoryAdapter(rootDir);
  backend.initWithDatabase(new DatabaseSync(join(rootDir, ".oracle-memory", "memory.db")));
  return backend;
}

const args = process.argv.slice(2);
const command = args[0];

const oracle = new Oracle();

function printHelp() {
  console.log(`
🕷️ spider-oracle CLI

Usage: oracle <command> [options]

Commands:
  init                     Create starter persona files to fill in
  search <query>           Search persona data
  consult <topic>          Consult persona about a topic
  ask <question>           Ask ChatGPT using Oracle persona context
  taste <area>             Look up taste in an area
  decide <decision>        Consult decision algorithm
  stats                    Show persona statistics
  doctor                   Check persona, gateway, and ChatGPT bridge
  list                     List all persona files
  export [file]            Export persona data to file
  import <file>            Import persona data from file
  validate                 Validate persona data integrity
  memory add <text>        Store durable memory
  memory search <query>   Search durable memory
  memory list              List durable memories

Options:
  --top <n>                Number of results (default: 5)
  --format <type>          Output format: text, json (default: text)
  --template <name>        Template for init (default: developer)
  --dir <path>             Persona directory (default: ~/.oracleai)
  --list                   With init: show the available templates
  --help                   Show this help message

Examples:
  oracle init                        # start here: writes ~/.oracleai
  oracle init --template minimal
  oracle search "TypeScript zero dependencies"
  oracle consult "choosing a database"
  oracle taste "ui"
  oracle decide "PostgreSQL vs SQLite" "PostgreSQL" "SQLite"
  oracle stats
  oracle export ~/persona-backup.json
  oracle validate
`);
}

function printResults(results: unknown[], format: string) {
  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(r);
      console.log("");
    }
  }
}

async function main() {
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const format = args.includes("--format") ? args[args.indexOf("--format") + 1] : "text";
  const topK = args.includes("--top") ? parseInt(args[args.indexOf("--top") + 1]) : 5;

  switch (command) {
    case "init": {
      const { PERSONA_TEMPLATES, createFromTemplate } = await import("./templates.js");

      if (args.includes("--list")) {
        for (const template of Object.values(PERSONA_TEMPLATES)) {
          console.log(`${template.name.padEnd(10)} ${template.description}`);
          console.log(`${" ".repeat(10)} ${Object.keys(template.files).join(", ")}\n`);
        }
        break;
      }

      const templateName = args.includes("--template") ? args[args.indexOf("--template") + 1] : "developer";
      const targetDir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : PersonaRAG.defaultDir();
      if (!templateName || !targetDir) {
        console.error("Error: --template and --dir each need a value");
        process.exit(1);
      }

      try {
        // Existing files are left alone, so re-running after adding a template
        // never overwrites what has already been written by hand.
        const result = createFromTemplate(templateName, targetDir);
        if (result.filesCreated === 0) {
          console.log(`Nothing to create — every ${templateName} file already exists in ${targetDir}`);
        } else {
          console.log(`Created ${result.filesCreated} file(s) in ${result.targetDir}`);
        }
        console.log("\nThe values are placeholders. Edit them, then check with:");
        console.log("  oracle stats");
        console.log("  oracle consult \"choosing a database\"");
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
      break;
    }

    case "search": {
      const query = args[1];
      if (!query) {
        console.error("Error: search requires a query");
        process.exit(1);
      }
      const results = oracle.search(query, topK);
      const output = results.map((r) => {
        if (format === "json") return r;
        return `[${r.file.path}] (score: ${r.score.toFixed(3)})\n${r.excerpt}`;
      });
      printResults(output, format);
      break;
    }

    case "consult": {
      const topic = args[1];
      if (!topic) {
        console.error("Error: consult requires a topic");
        process.exit(1);
      }
      const context = args[2];
      const result = oracle.consult(topic, context);
      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`**${result.topic}**\n\n${result.answer}\n\nSources: ${result.sources.join(", ")}`);
      }
      break;
    }

    case "ask": {
      const question = args.slice(1).reduce<string[]>((parts, arg, index, all) => {
        if (arg.startsWith("--") || all[index - 1] === "--format" || all[index - 1] === "--top") return parts;
        parts.push(arg);
        return parts;
      }, []).join(" ");
      if (!question) {
        console.error("Error: ask requires a question");
        process.exit(1);
      }
      try {
        const result = await askWithPersona(oracle, question, {
          memory: await loadMemoryBackend(process.cwd()),
          ...(process.env.DEK_GATEWAY_URL ? { gatewayUrl: process.env.DEK_GATEWAY_URL } : {}),
          ...(process.env.DEK_GATEWAY_MODEL ? { model: process.env.DEK_GATEWAY_MODEL } : {}),
          ...(process.env.DEK_GATEWAY_KEY ? { apiKey: process.env.DEK_GATEWAY_KEY } : {}),
        });
        if (format === "json") console.log(JSON.stringify(result, null, 2));
        else console.log(result.answer);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
      break;
    }

    case "memory": {
      const action = args[1];
      const backend = await loadMemoryBackend(process.cwd());
      if (!backend) { console.error("Memory backend unavailable. Set DEK_MEMORY_ROOT to the memory package."); process.exit(1); }
      if (action === "add") {
        const content = args.slice(2).filter((arg, index, all) => !arg.startsWith("--") && all[index - 1] !== "--format").join(" " );
        if (!content) { console.error("Error: memory add requires text"); process.exit(1); }
        if (!backend.remember) { console.error("Memory backend cannot write"); process.exit(1); }
        const result = await backend.remember("oracle", "fact", content);
        console.log(format === "json" ? JSON.stringify(result, null, 2) : JSON.stringify(result));
      } else if (action === "search") {
        const query = args.slice(2).filter((arg) => !arg.startsWith("--")).join(" " );
        if (!query) { console.error("Error: memory search requires a query"); process.exit(1); }
        const result = await backend.searchMemories(query, { limit: topK });
        console.log(JSON.stringify(result, null, 2));
      } else if (action === "list") {
        if (!backend.recall) { console.error("Memory backend cannot recall"); process.exit(1); }
        console.log(JSON.stringify(await backend.recall({ limit: topK, touch: false }), null, 2));
      } else {
        console.error("Usage: oracle memory add|search|list"); process.exit(1);
      }
      break;
    }

    case "taste": {
      const area = args[1];
      if (!area) {
        console.error("Error: taste requires an area");
        process.exit(1);
      }
      const result = oracle.taste(area);
      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.preferences || "No data found.");
      }
      break;
    }

    case "decide": {
      const decision = args[1];
      if (!decision) {
        console.error("Error: decide requires a decision");
        process.exit(1);
      }
      const options = args.slice(2).filter((a) => !a.startsWith("--"));
      const result = oracle.decide(decision, options);
      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.analysis || "No data found.");
      }
      break;
    }

    case "stats": {
      const stats = oracle.stats();
      if (format === "json") {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log(`📊 Persona Statistics`);
        console.log(`   Files: ${stats.files}`);
        console.log(`   Terms: ${stats.terms}`);
        console.log(`   Categories: ${stats.categories.join(", ")}`);
      }
      break;
    }

    case "doctor": {
      const personaDir = PersonaRAG.defaultDir();
      const gatewayUrl = (process.env.DEK_GATEWAY_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
      const checks: Record<string, unknown> = {
        persona: validatePersona(personaDir),
        memory: existsSync(join(process.cwd(), ".oracle-memory")),
        gateway: false,
        chatgptBridge: false,
      };
      try {
        const response = await fetch(`${gatewayUrl}/api/chatgpt-web/status`, { signal: AbortSignal.timeout(3_000) });
        checks.gateway = response.ok;
        if (response.ok) {
          const status = await response.json() as { connected?: boolean };
          checks.chatgptBridge = status.connected === true;
        }
      } catch { /* report unavailable in the result */ }
      if (format === "json") console.log(JSON.stringify({ gatewayUrl, ...checks }, null, 2));
      else {
        console.log(`Persona: ${checks.persona && (checks.persona as { valid: boolean }).valid ? "OK" : "FAIL"}`);
        console.log(`Memory: ${checks.memory ? "FOUND" : "NOT FOUND"}`);
        console.log(`Gateway: ${checks.gateway ? "OK" : "UNAVAILABLE"}`);
        console.log(`ChatGPT bridge: ${checks.chatgptBridge ? "CONNECTED" : "NOT CONNECTED"}`);
      }
      break;
    }

    case "list": {
      const stats = oracle.stats();
      if (format === "json") {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log(`📁 Persona Files (${stats.files})\n`);
        for (const cat of stats.categories) {
          console.log(`   ${cat}`);
        }
      }
      break;
    }

    case "export": {
      const outputFile = args[1] ?? "persona-export.json";
      const result = exportPersona(PersonaRAG.defaultDir(), outputFile);
      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`✅ Exported ${result.files} files to ${result.path}`);
      }
      break;
    }

    case "import": {
      const inputFile = args[1];
      if (!inputFile) {
        console.error("Error: import requires a file path");
        process.exit(1);
      }
      const result = importPersona(inputFile, PersonaRAG.defaultDir());
      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`✅ Imported ${result.files} files (${result.added} added, ${result.updated} updated)`);
      }
      break;
    }

    case "validate": {
      const result = validatePersona(PersonaRAG.defaultDir());
      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`🔍 Validation Results`);
        console.log(`   Valid: ${result.valid ? "✅ Yes" : "❌ No"}`);
        console.log(`   Files: ${result.files}`);
        console.log(`   Errors: ${result.errors.length}`);
        console.log(`   Warnings: ${result.warnings.length}`);
        if (result.errors.length > 0) {
          console.log("\n   Errors:");
          for (const e of result.errors) {
            console.log(`     - ${e}`);
          }
        }
        if (result.warnings.length > 0) {
          console.log("\n   Warnings:");
          for (const w of result.warnings) {
            console.log(`     - ${w}`);
          }
        }
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
