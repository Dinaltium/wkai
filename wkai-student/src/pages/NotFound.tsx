import { useNavigate } from "react-router-dom";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-wkai-text-dim">
      <p className="text-5xl font-bold text-wkai-border">404</p>
      <p className="text-sm">Page not found</p>
      <button className="btn-ghost text-xs" onClick={() => navigate("/")}>
        ← Back to join
      </button>
    </div>
  );
}
