import { ENV } from "./env";
import { Semaphore } from "./concurrency";
import { boundedInt } from "./limits";
import { assertSafeEgress } from "./ssrfGuard";
import { readBoundedText } from "./httpSafety";

const llmSemaphore = new Semaphore(boundedInt(process.env.LLM_MAX_CONCURRENCY, 6, 1, 24), 12, 5000);

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type LlmProfile = "fast" | "deep";

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  /** Override model for this call (defaults to ENV.llmModel). */
  model?: string;
  /**
   * `fast` (default for interactive IRB AI): disable MiniMax-M3 thinking,
   * cap completion tokens, shorter timeout — much snappier UX.
   * `deep`: allow thinking / larger budgets (swarm, long proposals).
   */
  profile?: LlmProfile;
  /** MiniMax-M3 only. Overrides ENV.llmThinking when set. */
  thinking?: "disabled" | "adaptive";
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => {
  const raw = (ENV.llmApiUrl ?? "").trim();
  if (!raw) return "https://forge.manus.im/v1/chat/completions";
  // Allow callers to provide either a base ("https://api.minimax.io")
  // or a full path ("https://…/v1/chat/completions"). Normalise both.
  if (/\/v\d+\/chat\/completions$/.test(raw)) return raw;
  const base = raw.replace(/\/$/, "");
  return `${base}${/\/v\d+$/.test(base) ? "" : "/v1"}/chat/completions`;
};

const assertApiKey = () => {
  if (!ENV.llmApiKey) {
    throw new Error("LLM API key is not configured (LLM_API_KEY or BUILT_IN_FORGE_API_KEY)");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

function resolveThinking(
  profile: LlmProfile,
  explicit?: "disabled" | "adaptive"
): "disabled" | "adaptive" | null {
  if (explicit) return explicit;
  if (profile === "deep") return "adaptive";
  const envMode = ENV.llmThinking;
  if (envMode === "adaptive" || envMode === "enabled" || envMode === "on") {
    return "adaptive";
  }
  // Default interactive path: skip thinking (big latency win on MiniMax-M3).
  return "disabled";
}

function isMinimaxModel(model: string): boolean {
  return /minimax/i.test(model) || /api\.minimax\.io/i.test(ENV.llmApiUrl);
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  return llmSemaphore.run(() => invokeBoundedLLM(params));
}

async function invokeBoundedLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();
  if (process.env.AI_ENABLED === "0") throw new Error("AI processing is disabled by the operator");
  if (!params.messages.length || params.messages.length > 64 || Buffer.byteLength(JSON.stringify(params.messages)) > 128_000) {
    throw new Error("AI input exceeds the allowed context size");
  }
  if (ENV.llmProvider === "anthropic" || ENV.llmProvider === "claude") {
    throw new Error("Native Anthropic transport is not supported. Configure an approved OpenAI-compatible gateway.");
  }

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const profile: LlmProfile = params.profile ?? "fast";
  const model = (params.model ?? ENV.llmModel).trim() || ENV.llmModel;
  const requestedMax =
    params.maxTokens ?? params.max_tokens ?? (profile === "fast" ? ENV.llmFastMaxTokens : ENV.llmMaxTokens);
  // Interactive calls must stay bounded — 24k completion budgets force long waits.
  const maxTokens =
    profile === "fast"
      ? Math.min(requestedMax, Math.max(512, ENV.llmFastMaxTokens))
      : Math.min(requestedMax, ENV.llmMaxTokens);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new Error("Invalid AI token limit");

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
    max_tokens: maxTokens,
    // MiniMax prefers max_completion_tokens on newer APIs; harmless elsewhere.
    max_completion_tokens: maxTokens,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  // Anthropic-native thinking budget (Forge / Claude).
  if (ENV.llmProvider === "anthropic" || ENV.llmProvider === "claude") {
    payload.thinking = { budget_tokens: profile === "fast" ? 128 : 1024 };
  }

  // MiniMax-M3: disable thinking on the fast path (measured ~2–3× faster).
  const thinking = resolveThinking(profile, params.thinking);
  if (thinking && isMinimaxModel(model) && /m3/i.test(model)) {
    payload.thinking = { type: thinking };
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
    // Some OpenAI-compatible providers (MiniMax among them) accept
    // response_format but do NOT enforce the schema server-side — the model
    // never sees it and invents its own key names (often snake_case),
    // which silently zeroes out every field lookup downstream. Embed the
    // exact schema in the conversation as well; providers that do enforce
    // it are unaffected.
    if (normalizedResponseFormat.type === "json_schema") {
      (payload.messages as unknown[]).push({
        role: "user",
        content:
          "Your entire reply must be a single JSON object that validates against this JSON Schema. " +
          "Use these EXACT property names (same casing) and types — no extra keys, no prose:\n" +
          JSON.stringify(normalizedResponseFormat.json_schema.schema),
      });
    }
  }

  const timeoutMs =
    profile === "fast"
      ? Math.min(ENV.llmTimeoutMs || 90_000, 90_000)
      : Math.min(Math.max(ENV.llmTimeoutMs, 90_000), 120_000);

  const apiUrl = resolveApiUrl();
  await assertSafeEgress(apiUrl);
  if (ENV.isProduction && new URL(apiUrl).protocol !== "https:") throw new Error("AI transport requires HTTPS");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", authorization: `Bearer ${ENV.llmApiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      // Provider bodies can contain echoed prompts, PHI and credentials. Never log/return them.
      throw new Error(`LLM provider unavailable (HTTP ${response.status})`);
    }
    const result = JSON.parse(await readBoundedText(response, 1_000_000)) as InvokeResult;
    if (!Array.isArray(result.choices) || !result.choices.length) throw new Error("LLM returned no valid choices");
    for (const choice of result.choices) {
      if (choice.finish_reason === "length" || choice.finish_reason === "content_filter") throw new Error("LLM response incomplete or withheld");
      if (!choice.message || typeof choice.message.content !== "string") throw new Error("LLM returned invalid content");
      choice.message.content = stripReasoningTags(choice.message.content);
    }
    // One paid request per reservation. Never silently retry malformed generations.
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("LLM request timed out");
    if (error instanceof SyntaxError) throw new Error("LLM returned invalid JSON");
    throw error;
  } finally { clearTimeout(timer); }
}

const REASONING_TAG_RE = /<think>[\s\S]*?<\/think>\s*/gi;
const MARKDOWN_FENCE_RE = /^\s*```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/;

/**
 * Reasoning models (MiniMax M2, DeepSeek R1, …) often wrap structured
 * output in `<think>...</think>` blocks AND markdown code fences. Strip
 * both so JSON.parse downstream works.
 */
/** Exported for unit tests — keep MiniMax M2/M3 / R1 reasoning wrappers out of JSON. */
export function stripReasoningTags(s: string): string {
  let out = s.replace(REASONING_TAG_RE, "").trim();
  const fenced = out.match(MARKDOWN_FENCE_RE);
  if (fenced) out = fenced[1].trim();
  return out;
}

/**
 * Robust JSON.parse — tolerates the failure modes we see with reasoning
 * models: leading prose, trailing commentary, truncated tail (token
 * budget exhausted mid-object). Returns {} if nothing salvageable.
 */
export function safeJsonParse(s: string): any {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    // 1) try carving the largest substring between the first `{` and last `}`
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first !== -1 && last > first) {
      const slice = s.slice(first, last + 1);
      try {
        return JSON.parse(slice);
      } catch {
        /* keep trying */
      }
    }
    // Truncated responses are never repaired into apparently complete evidence.
    return {};
  }
}
