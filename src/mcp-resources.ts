import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Oracle } from "./oracle.js";

export function addResources(server: McpServer, oracle: Oracle): void {
  server.resource(
    "persona-overview",
    "oracle://persona/overview",
    async (uri) => {
      const stats = oracle.stats();
      const content = `# Persona Overview

## Statistics
- Files: ${stats.files}
- Terms: ${stats.terms}

## Available Areas
- identity, communication, taste, technical, decisions, psychology

## Usage
Consult the oracle with questions about preferences, decisions, or personality.
`;
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/markdown",
          text: content,
        }],
      };
    }
  );

  server.resource(
    "taste-areas",
    "oracle://persona/taste",
    async (uri) => {
      const areas = ["software", "ui", "games", "ai", "risk", "communication"];
      const content = `# Taste Areas

${areas.map((a) => `- **${a}**: Use oracle_taste tool with area="${a}"`).join("\n")}
`;
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/markdown",
          text: content,
        }],
      };
    }
  );

  server.resource(
    "decision-categories",
    "oracle://persona/decisions",
    async (uri) => {
      const content = `# Decision Categories

## Algorithm
Approach to making decisions (speed, analysis, risk tolerance).

## Risk
Risk assessment preferences (conservative, balanced, aggressive).

## Work-style
Work patterns (focused, collaborative, exploratory).

Use oracle_decide tool to consult on specific decisions.
`;
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/markdown",
          text: content,
        }],
      };
    }
  );
}
