import { WifiOff } from "lucide-react";

export function InstructorOfflineBanner() {
  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-2 border-b border-warn/30 bg-warn/10 px-3 py-2.5 sm:px-4"
    >
      <WifiOff size={14} className="mt-px shrink-0 text-warn" />
      <p className="text-xs font-medium leading-relaxed text-warn">
        Instructor disconnected. Stay put — your guide and files keep working, and the stream
        resumes on its own when they come back.
      </p>
    </div>
  );
}
