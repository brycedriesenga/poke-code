import type { PokeConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeConfig(raw: Partial<PokeConfig> | Record<string, unknown>): PokeConfig {
  const partial = raw as Partial<PokeConfig>;

  const imessage = {
    ...DEFAULT_CONFIG.imessage,
    ...(partial.imessage ?? {}),
  };
  const mcp = {
    ...DEFAULT_CONFIG.mcp,
    ...(partial.mcp ?? {}),
    localServer: {
      ...DEFAULT_CONFIG.mcp.localServer,
      ...(partial.mcp?.localServer ?? {}),
    },
    reconnect: {
      ...DEFAULT_CONFIG.mcp.reconnect,
      ...(partial.mcp?.reconnect ?? {}),
    },
  };

  if (partial.chatId !== undefined && imessage.chatId === undefined) {
    imessage.chatId = partial.chatId;
  }
  if (partial.handleId !== undefined && imessage.handleId === undefined) {
    imessage.handleId = partial.handleId;
  }
  if (partial.handleIdentifier !== undefined && imessage.handleIdentifier === undefined) {
    imessage.handleIdentifier = partial.handleIdentifier;
  }

  const pollNormal = toNumber(partial.pollIntervalNormal);
  const pollFast = toNumber(partial.pollIntervalFast);
  const fastDuration = toNumber(partial.fastPollDuration);
  if (pollNormal !== undefined) imessage.pollIntervalNormal = pollNormal;
  if (pollFast !== undefined) imessage.pollIntervalFast = pollFast;
  if (fastDuration !== undefined) imessage.fastPollDuration = fastDuration;

  const transport =
    partial.transport ??
    (mcp.serverUrl && mcp.serverUrl.length > 0 ? "mcp" : "imessage");

  const normalized: PokeConfig = {
    ...DEFAULT_CONFIG,
    ...partial,
    transport,
    imessage,
    mcp,
    chatId: imessage.chatId,
    handleId: imessage.handleId,
    handleIdentifier: imessage.handleIdentifier,
    pollIntervalNormal: imessage.pollIntervalNormal,
    pollIntervalFast: imessage.pollIntervalFast,
    fastPollDuration: imessage.fastPollDuration,
  };

  normalized.imessage.enabled = normalized.transport === "imessage";
  normalized.mcp.enabled = normalized.transport === "mcp";

  return normalized;
}
