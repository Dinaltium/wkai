import { Bot } from "lucide-react";
import { useState } from "react";
import { CodeEditor } from "../shared/CodeEditor";
import { ErrorHelper } from "../error/ErrorHelper";
import { MessagePanel } from "../messages/MessagePanel";
import { ColabAssistPanel } from "./ColabAssistPanel";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

export function AIHelperPanel({ send }: Props) {
  const [assistTab, setAssistTab] = useState<"error" | "colab">("error");

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
          <div className="flex h-full flex-col">
            <div className="flex border-b border-wkai-border">
              <button
                className={`flex-1 py-2 text-xs font-medium ${assistTab === "error" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-wkai-text-dim"}`}
                onClick={() => setAssistTab("error")}
              >
                Error Helper
              </button>
              <button
                className={`flex-1 py-2 text-xs font-medium ${assistTab === "colab" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-wkai-text-dim"}`}
                onClick={() => setAssistTab("colab")}
              >
                Colab Assistant
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {assistTab === "error" ? <ErrorHelper send={send} /> : <ColabAssistPanel send={send} />}
            </div>
          </div>
        </div>
        <div className="min-h-0">
          <MessagePanel send={send} />
        </div>
      </div>
    </div>
  );
}

