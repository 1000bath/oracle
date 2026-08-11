import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Oracle } from "./oracle.js";
import { PersonaRAG } from "./rag.js";

export function createMcpServer(dataDir?: string) {
  const dir = dataDir ?? PersonaRAG.defaultDir();
  const oracle = new Oracle({ personaDir: dir });
  const stats = oracle.stats();
  console.error(`[dek-oracle] ${stats.files} files, ${stats.terms} terms from ${dir}`);

  const server = new McpServer({ name: "dek-oracle", version: "0.1.0" });

  server.tool("oracle_consult", "Consult Jonus's persona about a topic", {
    topic: z.string().describe("Topic to consult about"),
    context: z.string().optional().describe("Additional context"),
  }, async ({ topic, context }) => {
    const r = oracle.consult(topic, context);
    return { content: [{ type: "text" as const, text: `**${topic}**\n\n${r.answer}\n\nSources: ${r.sources.join(", ")}` }] };
  });

  server.tool("oracle_taste", "Look up taste in a specific area", {
    area: z.string().describe("Area: software, ui, games, ai, risk, communication"),
  }, async ({ area }) => {
    const r = oracle.taste(area);
    return { content: [{ type: "text" as const, text: r.preferences || "No data found." }] };
  });

  server.tool("oracle_decide", "Consult decision algorithm", {
    decision: z.string().describe("The decision"),
    options: z.array(z.string()).optional().describe("Options"),
  }, async ({ decision, options }) => {
    const r = oracle.decide(decision, options);
    return { content: [{ type: "text" as const, text: r.analysis || "No data found." }] };
  });

  server.tool("oracle_search", "Search all persona data", {
    query: z.string().describe("Search query"),
    top_k: z.number().optional().default(5),
  }, async ({ query, top_k }) => {
    const results = oracle.search(query, top_k);
    const text = results.map((r, i) => `${i + 1}. ${r.file.path} (${r.score.toFixed(2)})\n${r.excerpt}`).join("\n\n");
    return { content: [{ type: "text" as const, text: text || "No results." }] };
  });

  server.tool("oracle_stats", "Show persona database stats", {}, async () => {
    const s = oracle.stats();
    return { content: [{ type: "text" as const, text: `Files: ${s.files}, Terms: ${s.terms}, Categories: ${s.categories.join(", ")}` }] };
  });

  return server;
}

export async function serve(dataDir?: string) {
  const server = createMcpServer(dataDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[dek-oracle] MCP server running on stdio");
}

serve().catch((err) => { console.error("[dek-oracle] Fatal:", err); process.exit(1); });
