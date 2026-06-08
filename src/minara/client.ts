import { DeveloperChatRequest, DeveloperChatResponse, IntentToSwapTxRequest, IntentToSwapTxResponse } from "./types.js";

export class MinaraClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(opts?: { baseUrl?: string; timeoutMs?: number }) {
    this.baseUrl = (opts?.baseUrl ?? "https://api-developer.minara.ai").replace(/\/+$/, "");
    this.timeoutMs = opts?.timeoutMs ?? 20_000;
  }

  async developerChat(apiKey: string, content: string): Promise<DeveloperChatResponse> {
    const body: DeveloperChatRequest = {
      mode: "fast",
      stream: false,
      message: { role: "user", content },
    };

    return this.requestJson("/v1/developer/chat", apiKey, body);
  }

  async intentToSwapTx(apiKey: string, req: IntentToSwapTxRequest): Promise<IntentToSwapTxResponse> {
    return this.requestJson("/v1/developer/intent-to-swap-tx", apiKey, req);
  }

  private async requestJson<TReq extends object, TRes>(
    path: string,
    apiKey: string,
    body: TReq,
  ): Promise<TRes> {
    const url = `${this.baseUrl}${path}`;
    let attempt = 0;
    let backoffMs = 500;

    while (true) {
      attempt += 1;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          if (attempt >= 5) {
            const text = await res.text().catch(() => "");
            throw new Error(`Minara API error ${res.status}: ${res.statusText}${text ? `: ${text}` : ""}`);
          }
          await sleep(backoffMs + Math.floor(Math.random() * 250));
          backoffMs = Math.min(backoffMs * 2, 5_000);
          continue;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Minara API error ${res.status}: ${res.statusText}${text ? `: ${text}` : ""}`);
        }

        return (await res.json()) as TRes;
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
