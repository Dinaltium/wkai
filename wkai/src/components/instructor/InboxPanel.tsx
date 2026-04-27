import { useState } from "react";
import { useAppStore } from "../../store";
import type { InstructorMessage } from "../../types";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

export function InboxPanel({ send }: Props) {
  const { inboxMessages, markInboxReplied } = useAppStore();
  const [replyById, setReplyById] = useState<Record<string, string>>({});

  function sendReply(message: InstructorMessage) {
    const reply = (replyById[message.messageId] ?? "").trim();
    if (!reply) return;
    send("instructor-reply", {
      messageId: message.messageId,
      studentId: message.studentId,
      reply,
    });
    markInboxReplied(message.messageId);
    setReplyById((s) => ({ ...s, [message.messageId]: "" }));
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
          Student Q&A Inbox
        </p>
        <span className="text-xs text-wkai-text-dim">{inboxMessages.length} message(s)</span>
      </div>
      <div className="p-3 space-y-3">
        {inboxMessages.length === 0 ? (
          <p className="text-xs text-wkai-text-dim text-center py-8">No student questions yet</p>
        ) : (
          inboxMessages
            .slice()
            .reverse()
            .map((m) => (
              <div key={m.messageId} className="rounded-lg border border-wkai-border bg-wkai-surface p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-wkai-text">{m.studentName}</p>
                  <p className="text-[11px] text-wkai-text-dim">{new Date(m.timestamp).toLocaleTimeString()}</p>
                </div>
                <p className="text-xs text-wkai-text">{m.message}</p>
                <div className="flex gap-2">
                  <input
                    className="input text-xs"
                    placeholder={m.replied ? "Reply sent" : "Type a reply..."}
                    value={replyById[m.messageId] ?? ""}
                    disabled={m.replied}
                    onChange={(e) =>
                      setReplyById((s) => ({ ...s, [m.messageId]: e.target.value }))
                    }
                  />
                  <button
                    className="btn-primary text-xs"
                    disabled={m.replied || !(replyById[m.messageId] ?? "").trim()}
                    onClick={() => sendReply(m)}
                  >
                    Send
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
