import { useState } from "react";
import { Zap, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useAppStore } from "../../store";
import { captureTestFrame } from "../../lib/tauri";

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
      addDebugLog("Capturing test frame from screen...", "info");
      const frameB64 = await captureTestFrame();
      addDebugLog(`Test frame captured (base64 length: ${frameB64.length})`, "success");

      addDebugLog("Sending test to AI pipeline...", "info");
      const res = await fetch(`${settings.backendUrl}/api/ai/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errorMessage:
            "TEST_PROBE: Hello, this is an AI connectivity test. Please confirm you are operational.",
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      addDebugLog(`AI responded: ${String(data.diagnosis ?? "no diagnosis").slice(0, 80)}`, "success");
      setResult("success");
      setMessage("AI pipeline is operational and responding.");
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
        Captures a test frame and calls the AI pipeline. Check the debug console for details.
      </p>
    </div>
  );
}
