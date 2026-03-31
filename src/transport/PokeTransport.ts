export interface PokeTransport {
  initialize(): Promise<void>;
  sendMessage(message: string): Promise<void>;
  onMessage(callback: (response: string) => void): void;
  close(): void;
}
