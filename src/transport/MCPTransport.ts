import type { PokeTransport } from "./PokeTransport.js";

interface MCPTransportOptions {
  url: string;
  protocols?: string | string[];
}

type MessageCallback = (response: string) => void;
type PendingRequest = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export class MCPTransport implements PokeTransport {
  private readonly url: string;
  private readonly protocols?: string | string[];
  private socket: WebSocket | null = null;
  private callbacks: MessageCallback[] = [];
  private pending = new Map<string, PendingRequest>();

  constructor(options: MCPTransportOptions) {
    this.url = options.url;
    this.protocols = options.protocols;
  }

  async initialize(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = this.protocols ? new WebSocket(this.url, this.protocols) : new WebSocket(this.url);
    this.socket = ws;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Failed to connect to MCP transport at ${this.url}`));
      };

      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
      };

      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
    });

    ws.addEventListener("message", (event) => {
      const payload = typeof event.data === "string" ? event.data : String(event.data);
      this.handleIncoming(payload);
    });
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("MCP transport is not connected. Call initialize() first.");
    }

    this.socket.send(message);
  }

  onMessage(callback: MessageCallback): void {
    this.callbacks.push(callback);
  }

  async request(message: string, timeoutMs = 60_000): Promise<string> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("MCP transport is not connected. Call initialize() first.");
    }

    const id = this.generateRequestId();
    const envelope = JSON.stringify({ type: "user_message", id, text: message });

    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Timed out waiting for MCP response."));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeoutId });
      this.socket?.send(envelope);
    });
  }

  close(): void {
    for (const [_id, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("MCP transport closed before response was received."));
    }
    this.pending.clear();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.callbacks = [];
  }

  private handleIncoming(payload: string): void {
    try {
      const msg = JSON.parse(payload) as {
        id?: string;
        text?: string;
        type?: string;
        tool?: string;
        params?: { text?: string };
      };

      if (msg.id && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pending.delete(msg.id);
          pending.resolve(msg.text ?? "");
          return;
        }
      }

      if (msg.tool === "reply_to_terminal") {
        const text = msg.params?.text ?? "";
        for (const callback of this.callbacks) {
          callback(text);
        }
        return;
      }

      if (msg.type === "reply_to_terminal") {
        const text = msg.text ?? "";
        for (const callback of this.callbacks) {
          callback(text);
        }
        return;
      }
    } catch {
      // Fall through to raw passthrough.
    }

    for (const callback of this.callbacks) {
      callback(payload);
    }
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
