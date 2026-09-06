import { useState, useRef, useEffect } from "react";
import { useStore } from "../../store";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { clsx } from "clsx";
import type { ChatMessage } from "../../types";
import { useMediaQuery } from "../../hooks/useMediaQuery";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

export function MessagePanel({ send }: Props) {
  const { chatMessages, addChatMessage, studentId, session } = useStore();
  const studentName = localStorage.getItem("wkai_student_name") ?? "Student";
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  // Enter sends on a keyboard; on a touch keyboard Enter must insert a newline
  // or half the questions get sent half-written.
  const hasKeyboard = useMediaQuery("(pointer: fine)");

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
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Ask a question</h2>
          <p className="panel-sub">
            Your instructor sees this. If they are mid-demo, the AI answers within about 45 seconds.
          </p>
        </div>
      </div>

      <div className="scroll-area space-y-3 px-3 py-4 sm:px-4" aria-live="polite">
        {chatMessages.length === 0 ? (
          <EmptyMessages />
        ) : (
          chatMessages.map((m: ChatMessage) => (
            <MessageBubble key={m.id} msg={m} studentName={studentName} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-wkai-border bg-wkai-surface p-3">
        <label className="sr-only" htmlFor="question-input">Your question</label>
        <textarea
          id="question-input"
          className="input h-16 flex-1 resize-none text-sm sm:h-20"
          placeholder="What should I do when the install fails?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (hasKeyboard && e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className="btn-primary btn-icon shrink-0"
          onClick={handleSend}
          disabled={!text.trim()}
          aria-label="Send question"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

function EmptyMessages() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
        <MessageSquare size={20} className="text-wkai-text-dim" />
      </div>
      <p className="text-sm font-medium text-wkai-text">No questions yet</p>
      <p className="max-w-xs text-xs leading-relaxed text-wkai-text-dim">
        Asking here is private to you and the instructor — the rest of the class never sees it.
      </p>
    </div>
  );
}

function MessageBubble({ msg, studentName }: { msg: ChatMessage; studentName: string }) {
  const isStudent = msg.role === "student";
  const isAi = msg.role === "ai";

  return (
    <div className={clsx("flex flex-col", isStudent ? "items-end" : "items-start")}>
      <p className="mb-1 px-1 text-xs text-wkai-text-dim">
        {isStudent ? studentName : isAi ? "AI assistant" : "Instructor"}
      </p>
      <div
        className={clsx(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[28rem]",
          isStudent
            ? "rounded-br-sm bg-accent text-accent-fg"
            : isAi
              ? "rounded-bl-sm border border-warn/30 bg-warn/5 text-wkai-text"
              : "rounded-bl-sm border border-wkai-border bg-wkai-surface text-wkai-text"
        )}
      >
        {msg.pending ? (
          <span className="flex items-center gap-2 text-xs opacity-80">
            <Loader2 size={12} className="animate-spin" />
            Sending…
          </span>
        ) : (
          msg.text
        )}
      </div>
    </div>
  );
}
