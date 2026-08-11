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
```

## Use as MCP server

```bash
# Add to your MCP config
npx dek-oracle
# or import from dek-oracle/mcp
```

### MCP Tools
- `oracle_consult` — Ask how Jonus would think about a topic
- `oracle_taste` — Look up preferences in a specific area
- `oracle_decide` — Consult decision algorithm
- `oracle_search` — Full-text search across all persona data
- `oracle_stats` — Show database stats

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
