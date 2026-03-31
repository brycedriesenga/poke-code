import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalMcpServer } from "../../src/transport/local-mcp-server.js";

let server: LocalMcpServer | null = null;

afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
});

describe("LocalMcpServer", () => {
  it("responds to user_message envelopes with matching id", async () => {
    const apiClient = {
      sendMessage: vi.fn(async (_text: string) => ({ message: "server reply" })),
    } as any;

    server = new LocalMcpServer({ host: "127.0.0.1", port: 8899, apiClient });
    await server.start();

    const ws = new WebSocket("ws://127.0.0.1:8899");
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));

    const responsePromise = new Promise<{ id?: string; text?: string }>((resolve) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
    });

    ws.send(JSON.stringify({ type: "user_message", id: "abc", text: "hello" }));
    const response = await responsePromise;
    expect(response.id).toBe("abc");
    expect(response.text).toBe("server reply");

    ws.close();
  });
});
