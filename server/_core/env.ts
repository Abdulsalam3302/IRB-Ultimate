export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Forge gateway — used for non-LLM features (S3 proxy, data API,
  // push notifications, maps). Keep set to your Forge install.
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // LLM endpoint — falls back to forge* when LLM_* aren't set.
  // This lets you point AI review at MiniMax / OpenAI / Anthropic
  // while keeping Forge for everything else.
  llmApiUrl:
    process.env.LLM_API_URL?.trim() || process.env.BUILT_IN_FORGE_API_URL || "",
  llmApiKey:
    process.env.LLM_API_KEY?.trim() || process.env.BUILT_IN_FORGE_API_KEY || "",
  llmModel: process.env.LLM_MODEL ?? "MiniMax-M2",
  llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS ?? "8192", 10),
  llmProvider: (process.env.LLM_PROVIDER ?? "openai").toLowerCase(),
};
