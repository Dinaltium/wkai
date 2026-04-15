import { useState, useRef, useEffect } from "react";
import { useStore } from "../../store";
import { Send, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import type { ChatMessage } from "../../types";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

export function MessagePanel({ send }: Props) {
  const { chatMessages, addChatMessage, studentId, session } = useStore();
  const studentName = sessionStorage.getItem("wkai_student_name") ?? "Student";
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; autoSend?: boolean }>).detail;
      const textToUse = (detail?.text ?? "").trim();
      if (!textToUse) return;
      setText(textToUse);
      if (detail?.autoSend) {
        const messageId = `${studentId}_${Date.now()}`;
        const msg: ChatMessage = {
          id: messageId,
          role: "student",
          text: textToUse,
          timestamp: new Date().toISOString(),
          pending: true,
        };
        addChatMessage(msg);
        send("student-message", {
          messageId,
          message: textToUse,
          sessionId: session?.id,
        });
        setText("");
      }
    };
    window.addEventListener("wkai:prefill-question", handlePrefill);
    return () => window.removeEventListener("wkai:prefill-question", handlePrefill);
  }, [addChatMessage, send, session?.id, studentId]);

  function handleSend() {
    if (!text.trim()) return;
    const messageId = `${studentId}_${Date.now()}`;

    const msg: ChatMessage = {
      id: messageId,
      role: "student",
      text: text.trim(),
      timestamp: new Date().toISOString(),
      pending: true,
    };
    addChatMessage(msg);
    send("student-message", {
      messageId,
      message: text.trim(),
      sessionId: session?.id,
    });
    setText("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-wkai-text-dim">
          Ask a Question
        </p>
        <p className="text-xs text-wkai-text-dim mt-0.5">
          Your question will be seen by the instructor. If they are busy, the AI will respond within 45 seconds.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {chatMessages.length === 0 ? (
          <p className="text-center text-xs text-wkai-text-dim py-8">
            No messages yet. Ask a question.
          </p>
        ) : (
          chatMessages.map((m) => <MessageBubble key={m.id} msg={m} studentName={studentName} />)
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-wkai-border p-3 flex gap-2">
        <textarea
          className="input resize-none text-sm flex-1 h-20"
          placeholder="Type your question..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className="btn-primary self-end"
          onClick={handleSend}
          disabled={!text.trim()}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, studentName }: { msg: ChatMessage; studentName: string }) {
  const isStudent = msg.role === "student";
  const isAi = msg.role === "ai";

  return (
    <div className={clsx("flex flex-col", isStudent ? "items-end" : "items-start")}>
      <p className="text-xs text-wkai-text-dim mb-1 px-1">
        {isStudent ? studentName : isAi ? "AI Assistant" : "Instructor"}
      </p>
      <div
        className={clsx(
          "max-w-xs rounded-xl px-4 py-2.5 text-sm",
          isStudent
            ? "bg-indigo-500 text-white rounded-br-sm"
            : isAi
            ? "border border-amber-500/30 bg-amber-500/5 text-wkai-text rounded-bl-sm"
            : "border border-wkai-border bg-wkai-surface text-wkai-text rounded-bl-sm"
        )}
      >
        {msg.pending ? (
          <span className="flex items-center gap-2 text-xs opacity-70">
            <Loader2 size={12} className="animate-spin" />
            Sending...
          </span>
        ) : (
          msg.text
        )}
      </div>
    </div>
  );
}
