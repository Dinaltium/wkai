import { Bot } from "lucide-react";
import { CodeEditor } from "../shared/CodeEditor";
import { ErrorHelper } from "../error/ErrorHelper";
import { MessagePanel } from "../messages/MessagePanel";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

export function AIHelperPanel({ send }: Props) {
  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-3">
      <div className="lg:col-span-2 border-r border-wkai-border min-h-0 flex flex-col">
        <div className="border-b border-wkai-border px-4 py-2 bg-wkai-surface">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 flex items-center gap-2">
            <Bot size={12} />
            AI Helper Workspace
          </p>
          <p className="text-xs text-wkai-text-dim mt-1">
            Write/run code, diagnose errors, and ask AI follow-ups with workshop context.
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <CodeEditor />
        </div>
      </div>
      <div className="min-h-0 grid grid-rows-2">
        <div className="border-b border-wkai-border min-h-0">
          <ErrorHelper send={send} />
        </div>
        <div className="min-h-0">
          <MessagePanel send={send} />
        </div>
      </div>
    </div>
  );
}

