import { friendlyChatSendError, isMissingChatProcedure } from "@shared/chatErrors";

export type ChatSendInput = {
  applicationId: number;
  messages: { role: "user" | "assistant"; content: string }[];
  lang?: "ar" | "en";
};

export type ChatSendResult = {
  reply: string;
  updatesApplied: string[];
  missing: string[];
};

function asResult(data: unknown): ChatSendResult | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const inner =
    (row.result && typeof row.result === "object"
      ? (row.result as Record<string, unknown>).data
      : null) ?? row;
  const json =
    inner && typeof inner === "object" && "json" in (inner as object)
      ? (inner as { json: unknown }).json
      : inner;
  if (!json || typeof json !== "object") return null;
  const parsed = json as Record<string, unknown>;
  if (typeof parsed.reply !== "string") return null;
  return {
    reply: parsed.reply,
    updatesApplied: Array.isArray(parsed.updatesApplied)
      ? parsed.updatesApplied.filter((x): x is string => typeof x === "string")
      : [],
    missing: Array.isArray(parsed.missing)
      ? parsed.missing.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function errorText(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const row = data as Record<string, unknown>;
  const err = row.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    const json = e.json as { message?: string } | undefined;
    if (typeof json?.message === "string") return json.message;
  }
  if (typeof row.message === "string") return row.message;
  return fallback;
}

async function postJson(url: string, body: unknown): Promise<ChatSendResult | "missing" | "fail"> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const combined = `${text} ${errorText(parsed, "")}`;
    if (res.status === 404 || isMissingChatProcedure(combined)) return "missing";
    const result = asResult(parsed);
    if (result) return result;
    if (!res.ok) return "fail";
    return "missing";
  } catch {
    return "fail";
  }
}

/**
 * Primary path is tRPC `chatApplication.sendMessage`. If the live API is an
 * older build, fall back to the alias procedure then REST adapters.
 */
export async function sendChatApplicationTurn(
  input: ChatSendInput,
  primary: () => Promise<ChatSendResult>,
): Promise<ChatSendResult> {
  try {
    return await primary();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isMissingChatProcedure(msg) && !/404/.test(msg)) {
      throw err;
    }
  }

  const alias = await postJson("/api/trpc/application.sendChatMessage", { json: input });
  if (alias && alias !== "missing" && alias !== "fail") return alias;

  const restAttempts: Array<[string, unknown]> = [
    ["/api/irb/chat", input],
    ["/api/chat/send", input],
    [
      `/api/irb/applications/${input.applicationId}/chat`,
      { messages: input.messages, lang: input.lang },
    ],
  ];
  let sawFail = false;
  for (const [url, body] of restAttempts) {
    const result = await postJson(url, body);
    if (result && result !== "missing" && result !== "fail") return result;
    if (result === "fail") sawFail = true;
  }
  throw new Error(sawFail ? "CHAT_SEND_FAILED" : "CHAT_SEND_UNAVAILABLE");
}

export { friendlyChatSendError, isMissingChatProcedure };
