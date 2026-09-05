import { useT } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type Message = { role: "user" | "assistant" | "system"; content: string };

export function AIChatBox({
  messages,
  isLoading,
  onSendMessage,
  placeholder,
  suggestedPrompts,
  height = 480,
}: {
  messages: Message[];
  isLoading?: boolean;
  onSendMessage: (content: string) => void;
  placeholder?: string;
  suggestedPrompts?: string[];
  height?: number;
}) {
  const { lang } = useT();
  const isAr = lang === "ar";
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [messages, isLoading]);

  const send = () => {
    const next = text.trim();
    if (!next || isLoading) return;
    setText("");
    onSendMessage(next);
  };

  return (
    <div className="rounded-xl border bg-card flex flex-col overflow-hidden" style={{ height }}>
      <div role="log" aria-live="polite" aria-relevant="additions" aria-label={isAr ? "محادثة الطلب" : "Application conversation"} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            dir="auto"
            className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "ms-auto bg-forest-900 text-cream-50"
                : "me-auto bg-muted text-foreground"
            }`}
          >
            {m.content}
          </div>
        ))}
        {isLoading && (
          <div className="me-auto text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
        )}
        <div ref={endRef} />
      </div>
      {suggestedPrompts && suggestedPrompts.length > 0 && messages.length <= 1 && (
        <div className="px-3 pb-2 flex flex-wrap gap-2">
          {suggestedPrompts.map(p => (
            <Button key={p} type="button" size="sm" variant="outline" disabled={isLoading} onClick={() => onSendMessage(p)}>
              {p}
            </Button>
          ))}
        </div>
      )}
      <form
        className="border-t p-3 flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          send();
        }}
      >
        <Input
          aria-label={isAr ? "رسالتك إلى مساعد الطلبات" : "Message to the application assistant"}
          maxLength={4000}
          dir="auto"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
        />
        <Button type="submit" size="icon" disabled={isLoading || !text.trim()} aria-label={isAr ? "إرسال" : "Send"}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
