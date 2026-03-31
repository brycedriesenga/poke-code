import { McpHttpServer } from "./mcp-http-server.js";

const TERMINAL_INSTRUCTION =
  "[TERMINAL SESSION — MANDATORY]\n" +
  "The user is chatting in a terminal session.\n" +
  "Do not send replies via iMessage/SMS/Telegram.\n" +
  "Do not write chat text directly.\n" +
  "Call reply_to_terminal with your full response text.\n" +
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

    await this.tunnel.start();
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
}
