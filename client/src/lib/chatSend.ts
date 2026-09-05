import { friendlyChatSendError, isMissingChatProcedure } from "@shared/chatErrors";

export type ChatSendInput = {
  applicationId: number;
  messages: { role: "user" | "assistant"; content: string }[];
  lang?: "ar" | "en";
};
export type ChatSendResult = { reply: string; updatesApplied: string[]; missing: string[] };

/** A mutation with an ambiguous response must never be replayed through aliases. */
export async function sendChatApplicationTurn(
  _input: ChatSendInput,
  primary: () => Promise<ChatSendResult>,
): Promise<ChatSendResult> {
  return primary();
}
export { friendlyChatSendError, isMissingChatProcedure };
