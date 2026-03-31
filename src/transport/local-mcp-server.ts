import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { PokeApiClient } from "../api/client.js";

export interface LocalMcpServerOptions {
  host: string;
  port: number;
  apiClient: PokeApiClient;
}

export class LocalMcpServer {
  private readonly host: string;
  private readonly port: number;
  private readonly apiClient: PokeApiClient;
  private httpServer: Server | null = null;
  private wsServer: WebSocketServer | null = null;

  constructor(options: LocalMcpServerOptions) {
    this.host = options.host;
    this.port = options.port;
    this.apiClient = options.apiClient;
  }

  async start(): Promise<void> {
    if (this.wsServer) return;

    const httpServer = createServer();
    const wsServer = new WebSocketServer({ server: httpServer });

    wsServer.on("connection", (socket) => {
      socket.on("message", (raw) => {
        void this.handleMessage(socket, raw.toString());
      });
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(this.port, this.host, () => {
        httpServer.off("error", reject);
        resolve();
      });
    });

    this.httpServer = httpServer;
    this.wsServer = wsServer;
  }

  async stop(): Promise<void> {
    if (!this.wsServer || !this.httpServer) return;

    await new Promise<void>((resolve) => {
      this.wsServer?.close(() => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      this.httpServer?.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.wsServer = null;
    this.httpServer = null;
  }

  private async handleMessage(socket: WebSocket, payload: string): Promise<void> {
    let id: string | undefined;
    let text = "";
    try {
      const parsed = JSON.parse(payload) as { id?: string; text?: string };
      id = parsed.id;
      text = parsed.text ?? "";
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid MCP message payload." }));
      return;
    }

    try {
      const response = await this.apiClient.sendMessage(text);
      socket.send(JSON.stringify({ id, text: response.message ?? "" }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      socket.send(JSON.stringify({ id, type: "error", message }));
    }
  }
}
