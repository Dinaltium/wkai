import { type RefObject } from "react";
import { Monitor } from "lucide-react";
import type { CaptureStatusType } from "../../types/nativeCapture";

interface CapturePreviewProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  attachCanvas: (canvas: HTMLCanvasElement | null) => void;
  status: CaptureStatusType;
}

export function CapturePreview({
  canvasRef,
  attachCanvas,
  status,
}: CapturePreviewProps) {
  const isCapturing = status === "capturing";

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden bg-wkai-bg border transition-all duration-300 ${
        isCapturing
          ? "border-teal-500/50 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
          : "border-wkai-border"
      }`}
      style={{ aspectRatio: "16 / 9" }}
    >
      <canvas
        ref={(el) => {
          // Assign both the hook's canvasRef and call attachCanvas
          (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
          attachCanvas(el);
        }}
        className="w-full h-full object-contain"
        style={{ display: isCapturing ? "block" : "none" }}
      />

      {!isCapturing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-wkai-surface flex items-center justify-center">
            <Monitor size={28} className="text-wkai-text-dim" />
          </div>
          <span className="text-sm text-wkai-text-dim">
            {status === "initializing"
              ? "Initializing capture..."
              : status === "stopping"
              ? "Stopping capture..."
              : "No capture active"}
          </span>
        </div>
      )}

      {/* Live indicator */}
      {isCapturing && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-md bg-red-500/90 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-semibold text-white uppercase tracking-wider">
            Live
          </span>
        </div>
      )}
    </div>
  );
}
