import { afterEach, describe, expect, it, vi } from "vitest";
import { McpHttpServer } from "../../src/transport/mcp-http-server.js";

let server: McpHttpServer | null = null;
let port = 0;

afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
});

describe("McpHttpServer", () => {
  it("lists terminal tools and forwards reply_to_terminal calls", async () => {
    const onReply = vi.fn();
    server = new McpHttpServer({ onReply });
    port = await server.start(0);

    const listRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const listJson = (await listRes.json()) as { result?: { tools?: Array<{ name: string }> } };

    expect(listRes.ok).toBe(true);
    expect(listJson.result?.tools?.map((t) => t.name)).toContain("reply_to_terminal");

    const callRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "reply_to_terminal", arguments: { text: "hello from tool" } },
      }),
    });

    expect(callRes.ok).toBe(true);
    expect(onReply).toHaveBeenCalledWith("hello from tool");
  });
});
