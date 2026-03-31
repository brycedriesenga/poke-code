import { describe, expect, it, vi, beforeEach } from "vitest";
import { MCPTransport } from "../../src/transport/MCPTransport.js";

class MockSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = MockSocket.CONNECTING;
  sent: string[] = [];
  listeners: Record<string, Array<(event?: any) => void>> = {};

  constructor(_url: string, _protocols?: string | string[]) {
    queueMicrotask(() => {
      this.readyState = MockSocket.OPEN;
      this.emit("open");
    });
  }

  addEventListener(type: string, cb: (event?: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  removeEventListener(type: string, cb: (event?: any) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((x) => x !== cb);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
  }

  emit(type: string, event?: any) {
    for (const cb of this.listeners[type] ?? []) cb(event);
  }
}

describe("MCPTransport", () => {
  beforeEach(() => {
    (globalThis as any).WebSocket = MockSocket as any;
  });

  it("resolves request by response id", async () => {
    const transport = new MCPTransport({ url: "ws://example" });
    await transport.initialize();

    const pending = transport.request("hello", 5000);

    const socket = (transport as any).socket as MockSocket;
    const sent = JSON.parse(socket.sent[0]);
    socket.emit("message", { data: JSON.stringify({ id: sent.id, text: "reply" }) });

    await expect(pending).resolves.toBe("reply");
  });

  it("forwards reply_to_terminal events to callbacks", async () => {
    const transport = new MCPTransport({ url: "ws://example" });
    await transport.initialize();

    const onMessage = vi.fn();
    transport.onMessage(onMessage);

    const socket = (transport as any).socket as MockSocket;
    socket.emit("message", { data: JSON.stringify({ tool: "reply_to_terminal", params: { text: "hi" } }) });

    expect(onMessage).toHaveBeenCalledWith("hi");
  });
});
