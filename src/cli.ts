#!/usr/bin/env node

import { Oracle } from "./oracle.js";
import { PersonaRAG } from "./rag.js";
import { exportPersona, importPersona, validatePersona } from "./export-import.js";

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
  taste <area>             Look up taste in an area
  decide <decision>        Consult decision algorithm
  stats                    Show persona statistics
  list                     List all persona files
  export [file]            Export persona data to file
  import <file>            Import persona data from file
  validate                 Validate persona data integrity

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
