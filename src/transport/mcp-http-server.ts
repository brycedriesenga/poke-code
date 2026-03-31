import http, { type Server } from "node:http";

export interface McpHttpServerEvents {
  onReply?: (text: string) => void;
  onNotification?: (message: string) => void;
  onError?: (message: string) => void;
}

const SERVER_INFO = {
  name: "poke-code",
  version: "0.1.0",
};

const TOOLS = [
  {
    name: "reply_to_terminal",
    description:
      "Send your full response to the user's terminal. This tool is the primary terminal response channel.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Response text to display in terminal" },
      },
      required: ["text"],
    },
  },
  {
    name: "notify_terminal",
    description: "Send a short status notification to terminal.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Notification text" },
      },
      required: ["message"],
    },
  },
];

type JsonRpcMessage = {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function buildJson(content: unknown, status = 200): { status: number; body: string } {
  return { status, body: JSON.stringify(content) };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export class McpHttpServer {
  private httpServer: Server | null = null;
  private readonly events: McpHttpServerEvents;

  constructor(events: McpHttpServerEvents = {}) {
    this.events = events;
  }

  async start(port = 0): Promise<number> {
    if (this.httpServer) {
      const addr = this.httpServer.address();
      return typeof addr === "object" && addr?.port ? addr.port : port;
    }

    this.httpServer = http.createServer(async (req, res) => {
      this.applyCors(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      if (req.method === "POST" && url.pathname === "/mcp") {
        await this.handleMcpPost(req, res);
        return;
      }

      if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer?.once("error", reject);
      this.httpServer?.listen(port, "127.0.0.1", () => resolve());
    });

    const addr = this.httpServer.address();
    if (typeof addr === "object" && addr?.port) {
      return addr.port;
    }
    throw new Error("Failed to determine MCP HTTP server port.");
  }

  async stop(): Promise<void> {
    if (!this.httpServer) return;
    await new Promise<void>((resolve, reject) => {
      this.httpServer?.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.httpServer = null;
  }

  private applyCors(res: http.ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  }

  private async handleMcpPost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as JsonRpcMessage | JsonRpcMessage[];
      const response = Array.isArray(parsed)
        ? parsed.map((msg) => this.handleJsonRpc(msg)).filter((item) => item !== null)
        : this.handleJsonRpc(parsed);

      if (response === null || (Array.isArray(response) && response.length === 0)) {
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.events.onError?.(`MCP request error: ${msg}`);
      const payload = buildJson({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }, 400);
      res.writeHead(payload.status, { "Content-Type": "application/json" });
      res.end(payload.body);
    }
  }

  private handleJsonRpc(msg: JsonRpcMessage): Record<string, unknown> | null {
    const id = msg.id;
    const method = msg.method;
    const params = msg.params;

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: (params?.protocolVersion as string) ?? "2024-11-05",
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: "This MCP server represents the user's terminal. Use reply_to_terminal for visible replies.",
          },
        };
      case "notifications/initialized":
        return null;
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      case "tools/call": {
        const name = params?.name;
        const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
        if (name === "reply_to_terminal") {
          this.events.onReply?.(String(args.text ?? ""));
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Delivered to terminal." }] } };
        }
        if (name === "notify_terminal") {
          this.events.onNotification?.(String(args.message ?? ""));
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Notification sent." }] } };
        }
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: `Unknown tool: ${String(name ?? "")}` }], isError: true },
        };
      }
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      default:
        if (id === undefined || id === null) return null;
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${String(method ?? "")}` },
        };
    }
  }
}
