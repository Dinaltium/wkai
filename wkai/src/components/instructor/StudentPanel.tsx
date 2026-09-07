import { useEffect, useRef, useState } from "react";
import { UserMinus, Users } from "lucide-react";
import { clsx } from "clsx";
import { useAppStore } from "../../store";

type Send = <T>(type: string, payload: T) => void;

export function StudentPanel({ send }: { send: Send }) {
  const { students, studentCount, removeStudent, addDebugLog } = useAppStore();
  // Removing someone from a live room in front of a class is not undoable in
  // any way that matters, so the button arms first and disarms itself.
  const [armed, setArmed] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleRemove(studentId: string, studentName: string) {
    if (armed !== studentId) {
      setArmed(studentId);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setArmed(null), 4000);
      return;
    }
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setArmed(null);
    send("remove-student", { studentId, studentName });
    removeStudent(studentId);
    addDebugLog(`Removed ${studentName} from the session`, "warn");
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-semibold text-wkai-text">Students</p>
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent-text">
          {studentCount}
        </span>
      </div>

      <div className="px-3 py-2">
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-wkai-text-dim">
            <Users size={18} />
            <p className="text-xs">No students yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {students.map((s) => (
              <div
                key={s.studentId}
                className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-wkai-surface2"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-medium text-accent-text">
                  {s.studentName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-wkai-text">{s.studentName}</p>
                  <p className="text-xs text-wkai-text-dim">
                    {new Date(s.joinedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(s.studentId, s.studentName)}
                  onBlur={() => armed === s.studentId && setArmed(null)}
                  title={
                    armed === s.studentId
                      ? `Click again to remove ${s.studentName}`
                      : `Remove ${s.studentName} from the session`
                  }
                  aria-label={`Remove ${s.studentName} from the session`}
                  className={clsx(
                    "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    armed === s.studentId
                      ? "bg-danger text-white"
                      : "text-wkai-text-dim opacity-0 hover:bg-danger/15 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  )}
                >
                  <UserMinus size={13} />
                  {armed === s.studentId ? "Confirm" : "Remove"}
                </button>

                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
