import { createPollFn, type PollFn, type PollOptions } from "../api/conversation.js";
import { imsgSend } from "../db/imsg-sender.js";
import { ChatDbPoller } from "../db/poller.js";
import type { PokeTransport } from "./PokeTransport.js";

type MessageCallback = (response: string) => void;

export interface IMessageTransportOptions {
  dbPath: string;
  chatId: number;
  handleId: number;
}

export class IMessageTransport implements PokeTransport {
  private readonly dbPath: string;
  private readonly chatId: number;
  private readonly handleId: number;
  private poller: ChatDbPoller | null = null;
  private lastSeenRowId = 0;
  private callbacks: MessageCallback[] = [];

  constructor(options: IMessageTransportOptions) {
    this.dbPath = options.dbPath;
    this.chatId = options.chatId;
    this.handleId = options.handleId;
  }

  async initialize(): Promise<void> {
    if (this.poller) return;

    const poller = new ChatDbPoller(this.dbPath, {});
    poller.setHandle(this.handleId, this.chatId);

    const initial = poller.loadInitialMessages();
    if (initial.length > 0) {
      this.lastSeenRowId = initial[initial.length - 1].rowId;
    }

    poller.onMessages((messages) => {
      for (const msg of messages) {
        if (msg.isFromMe) continue;
        for (const cb of this.callbacks) {
          cb(msg.text);
        }
      }
    });

    this.poller = poller;
  }

  async sendMessage(message: string): Promise<void> {
    await imsgSend(this.chatId, message);
  }

  onMessage(callback: MessageCallback): void {
    this.callbacks.push(callback);
  }

  createPollFn(options: Omit<PollOptions, "onRowIdAdvance"> = {}): PollFn {
    if (!this.poller) {
      throw new Error("IMessage transport is not initialized. Call initialize() first.");
    }

    return createPollFn(this.poller, this.lastSeenRowId, {
      ...options,
      onRowIdAdvance: (rowId) => {
        this.lastSeenRowId = rowId;
      },
    });
  }

  close(): void {
    if (this.poller) {
      this.poller.close();
      this.poller = null;
    }
    this.callbacks = [];
  }
}
