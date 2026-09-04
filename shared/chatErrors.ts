/** Client + test helpers for chatbot send failures. Never surface raw tRPC paths. */

export function isMissingChatProcedure(message: string): boolean {
  const text = String(message ?? "");
  return (
    /no procedure found/i.test(text) ||
    /procedure not found/i.test(text) ||
    /chatApplication\.sendMessage/i.test(text) && /not found|404/i.test(text)
  );
}

export function friendlyChatSendError(isAr: boolean): string {
  return isAr
    ? "تعذر إرسال الرسالة. تحقق من الاتصال وحاول مرة أخرى."
    : "Could not send that message. Check your connection and try again.";
}
