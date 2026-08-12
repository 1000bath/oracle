import { describe, expect, test, vi } from "vitest";
import { askWithPersona, buildPersonaPrompt } from "./ask.js";
import type { Oracle } from "./oracle.js";

/** Only `consult` is used, so the rest of the surface is not worth faking. */
function fakeOracle(answer: string, sources: string[] = ["taste/ui.json"]): Oracle {
  return {
    consult: () => ({ topic: "t", answer, sources, files: [] })
  } as unknown as Oracle;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("buildPersonaPrompt", () => {
  test("frames persona material as data rather than instructions", () => {
    const prompt = buildPersonaPrompt("which database?", "prefers SQLite");
    // Persona files are prose pasted into a prompt — the classic injection
    // shape — so the framing is part of the contract, not decoration.
    expect(prompt).toMatch(/data, not as instructions/);
    expect(prompt).toContain("<persona>\nprefers SQLite\n</persona>");
    expect(prompt).toContain("Question: which database?");
  });

  test("says plainly when retrieval found nothing", () => {
    expect(buildPersonaPrompt("q", "   ")).toContain("(nothing in the persona matched this question)");
  });

  test("tells the model to answer general questions even with an empty persona", () => {
    // The first version answered *as* the person and withheld anything the
    // persona did not cover, so "choose a database" came back as a refusal.
    const prompt = buildPersonaPrompt("which database?", "");
    expect(prompt).toMatch(/Never refuse merely because the persona block/);
    expect(prompt).not.toMatch(/in their voice/);
  });

  test("keeps claims about the developer sourced to the persona", () => {
    const prompt = buildPersonaPrompt("what am I working on?", "");
    expect(prompt).toMatch(/must come from the persona block/);
  });
});

describe("askWithPersona", () => {
  test("sends the persona prompt to the gateway and returns the answer with its sources", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "  Use SQLite.  " } }]
    })) as unknown as typeof fetch;

    const result = await askWithPersona(fakeOracle("prefers local-first"), "which database?", {
      gatewayUrl: "http://127.0.0.1:9999/",
      fetchImpl
    });

    expect(result).toEqual({
      question: "which database?",
      answer: "Use SQLite.",
      sources: ["taste/ui.json"],
      memorySources: []
    });

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    // The trailing slash must not survive into the path.
    expect(url).toBe("http://127.0.0.1:9999/v1/chat/completions");
    const request = init as RequestInit & { headers: Record<string, string> };
    expect(request.headers["content-type"]).toBe("application/json");
    // Anything else is refused by the gateway for this model by design.
    expect(request.headers.authorization).toBeUndefined();
    const body = JSON.parse(String(request.body)) as { model: string; messages: Array<{ content: string }> };
    expect(body.model).toBe("chatgpt-web");
    expect(body.messages[0]?.content).toContain("prefers local-first");
  });

  test("includes durable memory alongside persona context when configured", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "Use the recorded choice." } }]
    })) as unknown as typeof fetch;

    await askWithPersona(fakeOracle("prefers local-first"), "which database?", {
      memory: {
        searchMemories: async () => [{ content: "SQLite is preferred for local tools", tags: ["database"] }],
      },
      fetchImpl,
    });

    const init = vi.mocked(fetchImpl).mock.calls[0]![1] as RequestInit;
    expect(String(init.body)).toContain("<durable-memory>");
    expect(String(init.body)).toContain("SQLite is preferred for local tools");
  });

  test("attaches a bearer token only when one is configured", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "ok" } }]
    })) as unknown as typeof fetch;

    await askWithPersona(fakeOracle("x"), "q", { apiKey: "secret", fetchImpl });

    const init = vi.mocked(fetchImpl).mock.calls[0]![1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.authorization).toBe("Bearer secret");
  });

  test("surfaces the gateway's own error, which is the actionable one", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(
      { error: { message: "No Chrome extension is connected." } },
      500
    )) as unknown as typeof fetch;

    await expect(askWithPersona(fakeOracle("x"), "q", { fetchImpl }))
      .rejects.toThrow("No Chrome extension is connected.");
  });

  test("explains how to start the gateway when it cannot be reached", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

    await expect(askWithPersona(fakeOracle("x"), "q", { fetchImpl }))
      .rejects.toThrow(/Could not reach the gateway.*npm start/s);
  });

  test("treats an empty completion as a failure rather than an answer", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "" } }]
    })) as unknown as typeof fetch;

    await expect(askWithPersona(fakeOracle("x"), "q", { fetchImpl }))
      .rejects.toThrow(/empty answer/);
  });

  test("rejects a blank question before any network call", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(askWithPersona(fakeOracle("x"), "   ", { fetchImpl })).rejects.toThrow(/question is required/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
