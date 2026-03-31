import { McpHttpServer } from "./mcp-http-server.js";

const TERMINAL_INSTRUCTION =
  "[TERMINAL SESSION — MANDATORY]\n" +
  "The user is chatting in a terminal session.\n" +
  "Do not send replies via iMessage/SMS/Telegram.\n" +
  "Do not write any text in the chat response body.\n" +
  "Your only response path is the reply_to_terminal tool.\n" +
  "Call reply_to_terminal with the full answer.\n" +
  "[END TERMINAL SESSION]\n\n";

interface PokeClientLike {
  sendMessage: (text: string) => Promise<{ success?: boolean; message?: string }>;
}

interface PokeTunnelLike {
  start: () => Promise<unknown>;
  stop: () => Promise<void>;
  on: (event: string, handler: (...args: any[]) => void) => void;
}

type PokeCtor = new (options: { apiKey: string }) => PokeClientLike;
type PokeTunnelCtor = new (options: {
  url: string;
  name: string;
  token: string;
  cleanupOnStop?: boolean;
}) => PokeTunnelLike;

export interface PokeMcpBridgeOptions {
  apiKey: string;
  onReply: (text: string) => void;
  onNotification?: (text: string) => void;
  onError?: (text: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class PokeMcpBridge {
  private readonly options: PokeMcpBridgeOptions;
  private readonly mcpServer: McpHttpServer;
  private pokeClient: PokeClientLike | null = null;
  private tunnel: PokeTunnelLike | null = null;

  constructor(options: PokeMcpBridgeOptions) {
    this.options = options;
    this.mcpServer = new McpHttpServer({
      onReply: options.onReply,
      onNotification: options.onNotification,
      onError: options.onError,
    });
  }

  async initialize(): Promise<void> {
    const port = await this.mcpServer.start(0);
    const mcpUrl = `http://127.0.0.1:${port}/mcp`;

    const sdk = (await import("poke")) as {
      Poke: PokeCtor;
      PokeTunnel: PokeTunnelCtor;
      getToken?: () => string | undefined;
    };

    this.pokeClient = new sdk.Poke({ apiKey: this.options.apiKey });

    const token = sdk.getToken?.() ?? this.options.apiKey;
    this.tunnel = new sdk.PokeTunnel({
      url: mcpUrl,
      name: "Poke Code Terminal",
      token,
      cleanupOnStop: false,
    });

    this.tunnel.on("connected", () => this.options.onConnected?.());
    this.tunnel.on("disconnected", () => this.options.onDisconnected?.());
    this.tunnel.on("error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.options.onError?.(`MCP tunnel error: ${msg}`);
    });

    const startInfo = await this.tunnel.start();
    await this.syncTools(startInfo, token);
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.pokeClient) {
      throw new Error("MCP bridge is not initialized.");
    }
    await this.pokeClient.sendMessage(`${TERMINAL_INSTRUCTION}${text}`);
  }

  async close(): Promise<void> {
    if (this.tunnel) {
      try {
        await this.tunnel.stop();
      } catch {
        // ignore shutdown errors
      }
      this.tunnel = null;
    }
    await this.mcpServer.stop();
  }

  private async syncTools(startInfo: unknown, token: string): Promise<void> {
    const connectionId =
      (startInfo as { connectionId?: string } | null | undefined)?.connectionId ??
      ((this.tunnel as { info?: { connectionId?: string } } | null)?.info?.connectionId ?? "");
    if (!connectionId) {
      this.options.onError?.("MCP tunnel connected but no connectionId was available for tool sync.");
      return;
    }

    const baseUrl = process.env.POKE_API ?? "https://poke.com/api/v1";
    const res = await fetch(`${baseUrl}/mcp/connections/${connectionId}/sync-tools`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      this.options.onError?.(`MCP tools sync failed: HTTP ${res.status}`);
    }
  }
}
