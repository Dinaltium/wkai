import { useState } from "react";
import { Bug, Code2, MessageSquare, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { CodeEditor } from "../shared/CodeEditor";
import { ErrorHelper } from "../error/ErrorHelper";
import { MessagePanel } from "../messages/MessagePanel";
import { ColabAssistPanel } from "./ColabAssistPanel";
import { useMediaQuery } from "../../hooks/useMediaQuery";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

type Pane = "editor" | "error" | "colab" | "ask";

const PANES: { id: Pane; label: string; icon: typeof Bug }[] = [
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "error", label: "Errors", icon: Bug },
  { id: "colab", label: "Colab", icon: Sparkles },
  { id: "ask", label: "Ask", icon: MessageSquare },
];

/**
 * Three tools in one workspace. Wide screens show them side by side; below
 * `lg` they become one pane at a time — stacking three scroll regions into a
 * phone viewport left each of them a few unusable centimetres tall.
 */
export function AIHelperPanel({ send }: Props) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const [pane, setPane] = useState<Pane>("editor");
  const [assistTab, setAssistTab] = useState<"error" | "colab">("error");

  if (!wide) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-wkai-border bg-wkai-surface p-2">
          <div className="seg" role="tablist" aria-label="AI helper tools">
            {PANES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={pane === id}
                onClick={() => setPane(id)}
                className={clsx("seg-item", pane === id && "seg-item-active")}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {pane === "editor" && <CodeEditor />}
          {pane === "error" && <ErrorHelper send={send} />}
          {pane === "colab" && <ColabAssistPanel send={send} />}
          {pane === "ask" && <MessagePanel send={send} />}
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-3">
      <div className="col-span-2 flex min-h-0 flex-col border-r border-wkai-border">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Workspace</h2>
            <p className="panel-sub">
              Write and run code here, then send anything that breaks to the helper on the right.
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <CodeEditor />
        </div>
      </div>

      <div className="grid min-h-0 grid-rows-2">
        <div className="flex min-h-0 flex-col border-b border-wkai-border">
          <div className="flex shrink-0 border-b border-wkai-border bg-wkai-surface" role="tablist" aria-label="Assistant">
            {(["error", "colab"] as const).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={assistTab === id}
                onClick={() => setAssistTab(id)}
                className={clsx(
                  "h-10 flex-1 text-xs font-medium transition-colors",
                  assistTab === id
                    ? "border-b-2 border-accent text-accent-text"
                    : "text-wkai-text-dim hover:text-wkai-text"
                )}
              >
                {id === "error" ? "Error helper" : "Colab assistant"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {assistTab === "error" ? <ErrorHelper send={send} /> : <ColabAssistPanel send={send} />}
          </div>
        </div>
        <div className="min-h-0">
          <MessagePanel send={send} />
        </div>
      </div>
    </div>
  );
}
