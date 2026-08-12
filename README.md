# 🕷️ spider-oracle

Spider persona framework — encode Jonus's identity as searchable knowledge that AI agents can consult.

## How it works

```
~/.oracleai/          ← your identity data (JSON)
    identity.json
    communication.json
    taste/
    technical/
    decisions/
    psychology/
        ↓
    dek-oracle         ← RAG engine + MCP server
        ↓
    AI agents          ← Claude Code, OpenCode, Codex
```

## Install

```bash
npm install dek-oracle
```

## Use from code

```ts
import { Oracle } from "dek-oracle";

const oracle = new Oracle();

// How would Jonus approach this?
const result = oracle.consult("choosing a database");
console.log(result.answer);

// What's his taste in UI?
const taste = oracle.taste("ui");
console.log(taste.preferences);

// Decision consultation
const decision = oracle.decide("use PostgreSQL vs SQLite", ["PostgreSQL", "SQLite"]);
console.log(decision.analysis);

// Search all persona data
const hits = oracle.search("TypeScript zero dependencies");

// Explain retrieval with confidence and exact supporting excerpts
const explanation = oracle.explain("choosing a database");
console.log(explanation.confidence, explanation.evidence);

// Small, cacheable persona context for prompts (bounded by character count)
const context = oracle.identity({ maxChars: 4000 });
console.log(context.context, context.sources);
```

## Memory metadata

Persona JSON files remain backward compatible: existing files need no changes. New files may include a `metadata` object (the `_memory` alias is also accepted) alongside their content:

```json
{
  "metadata": {
    "type": "episodic",
    "confidence": 0.8,
    "version": 2,
    "supersedes": "decisions/old.json",
    "validFrom": "2024-01-01T00:00:00Z",
    "validUntil": "2025-01-01T00:00:00Z"
  },
  "event": "Launched the service"
}
```

`type` is one of `episodic`, `semantic`, `procedural`, or `conversational`; confidence is between 0 and 1. Versions and supersession identifiers support revision tracking, while valid times describe when a memory applies. Metadata is exposed as `PersonaFile.metadata` and is excluded from searchable content. Invalid or unknown metadata fields are ignored, and legacy files continue to have `metadata` absent.

## Use as MCP server

```bash
# Add to your MCP config
npx dek-oracle
# or import from dek-oracle/mcp
```

### Offline maintenance

Use the enhanced CLI to inspect conflicting fields without network or model calls:

```bash
oracle-enhanced consolidate --strategy merge --max 100 --format json
oracle-enhanced consolidate --strategy prefer-source --apply
```

Consolidation is a dry-run by default and is bounded by `--max`; `--apply` is required to write changes.

### MCP Tools
- `oracle_consult` — Ask how Jonus would think about a topic
- `oracle_taste` — Look up preferences in a specific area
- `oracle_decide` — Consult decision algorithm
- `oracle_explain` — Explain a topic with confidence and supporting evidence
- `oracle_search` — Full-text search across all persona data
- `oracle_stats` — Show database stats

### Optional memory tools

`createMcpServer(dataDir, { memory })` accepts a structural `dek-memory` `MemoryPort` backend. When configured, the server exposes `memory_context`, `memory_search`, `memory_remember`, `memory_recall`, and `memory_explain` (graph reachability). The backend is optional so the Oracle package remains dependency-free and existing MCP clients/tools remain compatible; without it, memory calls return an explicit error.

## Data format

All persona data lives in `~/.oracleai/` as JSON files:

```json
{
  "ai": "Agentic systems มากกว่า chatbot",
  "architecture": "Local-first, modular, inspectable"
}
```

See the included examples for the full schema.

## Zero runtime dependencies

The core library has no dependencies. MCP SDK is only needed for the MCP server.


## Governance and safe forgetting

Governance helpers are available from the package root. `forgetPersona` is a dry run by
 default; pass `{ apply: true }` to remove matching dotted fields. Applying always creates a validated export before any write; provide
`backupFile` to control its path. `auditPersona` combines persona
validation with a bounded, read-only conflict report, while `governConflicts` wraps the
existing offline conflict consolidation API.

```ts
const preview = forgetPersona(dir, ["contact.email"]);
const audit = auditPersona(dir, { maxConflicts: 50 });
forgetPersona(dir, ["contact.email"], { apply: true, backupFile: "before-forget.json" });
```
