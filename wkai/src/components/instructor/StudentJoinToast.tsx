import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";

interface ToastItem {
  id: string;
  studentName: string;
}

export function StudentJoinToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { studentName: string };
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, studentName: detail.studentName }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };

    window.addEventListener("wkai:student-joined", handler);
    return () => window.removeEventListener("wkai:student-joined", handler);
  }, []);

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex animate-slide-up items-center gap-3 rounded-lg border border-emerald-500/30 bg-wkai-surface px-4 py-3 shadow-xl"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15">
            <UserCheck size={14} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-wkai-text">{t.studentName}</p>
            <p className="text-xs text-wkai-text-dim">joined the session</p>
          </div>
        </div>
      ))}
    </div>
  );
}

