import { useAppStore } from "../../store";
import { Users } from "lucide-react";

export function StudentPanel() {
  const { students, studentCount } = useAppStore();

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
          Students
        </p>
        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-400">
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
              <div key={s.studentId} className="flex items-center gap-2 rounded-lg px-2 py-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-medium text-indigo-400">
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
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

