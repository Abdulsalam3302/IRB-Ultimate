import { ENV } from "./env";

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

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
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
  return `${raw.replace(/\/$/, "")}/v1/chat/completions`;
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

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

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

  const payload: Record<string, unknown> = {
    model: ENV.llmModel,
    messages: messages.map(normalizeMessage),
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

  // Per-call override wins, else the env default. Reasoning models (MiniMax
  // M2) burn a large hidden reasoning budget BEFORE the answer, so callers
  // that ask for big structured output (e.g. the proposal generator) need
  // more headroom or the JSON truncates inside the <think> block.
  payload.max_tokens = params.maxTokens ?? params.max_tokens ?? ENV.llmMaxTokens;
  // `thinking` is Anthropic-specific. Only emit it for providers that
  // accept it; MiniMax / OpenAI / generic gateways will 400 on this field.
  if (ENV.llmProvider === "anthropic" || ENV.llmProvider === "claude") {
    payload.thinking = { budget_tokens: 128 };
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

  // Hard timeout. Reasoning models (M2 / R1) can take a while, but
  // an LLM call has no business taking longer than 2 minutes — without
  // this, a stuck socket once hung Stage 2 auto-complete for 15 minutes.
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS ?? "120000", 10);

  const attempt = async (): Promise<InvokeResult> => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(resolveApiUrl(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ENV.llmApiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutHandle);
      if ((err as any)?.name === "AbortError") {
        throw new Error(`LLM invoke timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
      );
    }

    const result = (await response.json()) as InvokeResult;
    // Reasoning models (MiniMax M2, DeepSeek R1, …) emit <think>...</think>
    // blocks before the real answer. Strip them so downstream JSON.parse works.
    for (const choice of result.choices ?? []) {
      const msg = choice?.message;
      if (msg && typeof msg.content === "string") {
        const before = msg.content;
        msg.content = stripReasoningTags(msg.content);
        if (process.env.LLM_DEBUG === "1") {
          console.log(
            "[LLM] finish=%s before-len=%d after-len=%d head=%j",
            choice.finish_reason,
            before.length,
            msg.content.length,
            msg.content.slice(0, 120)
          );
        }
      }
    }
    return result;
  };

  const result = await attempt();

  // Reasoning models occasionally emit a response whose JSON cannot be
  // salvaged at all (truncated mid-reasoning, prose-wrapped, braces inside
  // the think block). For schema-bound calls one bad sample would otherwise
  // surface as a zeroed-out review — retry exactly once before giving up.
  if (normalizedResponseFormat?.type === "json_schema") {
    const content = result.choices?.[0]?.message?.content;
    const parsed = safeJsonParse(typeof content === "string" ? content : "");
    if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length === 0) {
      console.warn("[LLM] schema-bound response unparseable — retrying once");
      return attempt();
    }
  }

  return result;
}

const REASONING_TAG_RE = /<think>[\s\S]*?<\/think>\s*/gi;
const MARKDOWN_FENCE_RE = /^\s*```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/;

/**
 * Reasoning models (MiniMax M2, DeepSeek R1, …) often wrap structured
 * output in `<think>...</think>` blocks AND markdown code fences. Strip
 * both so JSON.parse downstream works.
 */
function stripReasoningTags(s: string): string {
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
    // 2) walk from the end, dropping the last char until we get a parse
    if (first !== -1) {
      const head = s.slice(first);
      let trimmed = head;
      // try closing unclosed strings/objects/arrays — append closers up to 8 levels
      for (let attempts = 0; attempts < 8; attempts++) {
        try {
          return JSON.parse(trimmed);
        } catch {
          // strip trailing comma/whitespace, append a closer
          trimmed = trimmed.replace(/[,\s]+$/, "");
          // count unbalanced braces/brackets
          let braces = 0,
            brackets = 0;
          let inStr = false,
            esc = false;
          for (const c of trimmed) {
            if (esc) {
              esc = false;
              continue;
            }
            if (c === "\\") {
              esc = true;
              continue;
            }
            if (c === '"') inStr = !inStr;
            if (inStr) continue;
            if (c === "{") braces++;
            else if (c === "}") braces--;
            else if (c === "[") brackets++;
            else if (c === "]") brackets--;
          }
          if (inStr) trimmed += '"';
          while (brackets-- > 0) trimmed += "]";
          while (braces-- > 0) trimmed += "}";
        }
      }
    }
    return {};
  }
}
