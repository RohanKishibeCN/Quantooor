export type MinaraMode = "fast" | "expert";

export type DeveloperChatRequest = {
  mode: MinaraMode;
  stream: false;
  message: {
    role: "user";
    content: string;
  };
};

export type DeveloperChatResponse = {
  chatId?: string;
  messageId?: string;
  content?: string;
  usage?: unknown;
};

export type IntentToSwapTxRequest = {
  intent: string;
  walletAddress: `0x${string}`;
  chain?: string;
};

export type UnsignedTx = {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string | number;
  gas?: string | number;
  maxFeePerGas?: string | number;
  maxPriorityFeePerGas?: string | number;
};

export type SwapApproval = {
  unsignedTx?: UnsignedTx;
} & Record<string, unknown>;

export type IntentToSwapTxResponse = {
  unsignedTx?: UnsignedTx;
  approval?: SwapApproval;
} & Record<string, unknown>;

