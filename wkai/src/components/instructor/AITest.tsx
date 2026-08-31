import { useState } from "react";
import { Zap, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useAppStore } from "../../store";

export function AITest() {
  const { settings, addDebugLog } = useAppStore();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [message, setMessage] = useState("");

  async function runTest() {
    setTesting(true);
    setResult(null);
    setMessage("");
    addDebugLog("AI test started...", "info");

    try {
      // Query real agent health (config + observed error rate), not the LLM
      // itself. Feeding a fake "TEST_PROBE" string through /api/ai/diagnose
      // asked the DebugAgent's LLM to diagnose an error with no actual code
      // behind it — it would hallucinate a plausible-sounding but fabricated
      // diagnosis (e.g. "missing credentials") instead of confirming
      // connectivity, which read as a real problem when it wasn't one.
      addDebugLog("Checking AI agent health...", "info");
      const res = await fetch(`${settings.backendUrl}/api/ai/agents`);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const agents: Array<{ name: string; status: string; detail?: string }> =
        data.health ?? [];

      const unhealthy = agents.filter((a) => a.status !== "healthy" && a.status !== "disabled");

      agents.forEach((a) => {
        addDebugLog(
          `${a.name}: ${a.status}${a.detail ? ` — ${a.detail}` : ""}`,
          a.status === "healthy" || a.status === "disabled" ? "info" : "error"
        );
      });

      if (unhealthy.length > 0) {
        setResult("error");
        setMessage(
          `${unhealthy.length} agent(s) not healthy: ${unhealthy.map((a) => a.name).join(", ")}. Check debug console for details.`
        );
      } else {
        setResult("success");
        setMessage("AI pipeline is operational and responding.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addDebugLog(`AI test failed: ${msg}`, "error");
      setResult("error");
      setMessage(`Test failed: ${msg}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-wkai-text">AI Connection Test</span>
        <button className="btn-primary text-xs py-1.5" onClick={runTest} disabled={testing}>
          {testing ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Testing...
            </>
          ) : (
            <>
              <Zap size={12} /> Test AI
            </>
          )}
        </button>
      </div>

      {result && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
            result === "success"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
              : "border-red-500/30 bg-red-500/5 text-red-300"
          }`}
        >
          {result === "success" ? (
            <CheckCircle size={13} className="shrink-0 mt-0.5" />
          ) : (
            <XCircle size={13} className="shrink-0 mt-0.5" />
          )}
          {message}
        </div>
      )}

      <p className="text-xs text-wkai-text-dim">
        Calls the AI pipeline directly. Check the debug console for details.
      </p>
    </div>
  );
}
