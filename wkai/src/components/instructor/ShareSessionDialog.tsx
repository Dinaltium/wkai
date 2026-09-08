import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, X } from "lucide-react";
import { clsx } from "clsx";
import { useAppStore } from "../../store";
import { updateSessionPassword } from "../../lib/tauri";

/**
 * How students actually get in. The room code lived as small text in the
 * header with no way to copy it and no join link anywhere near it, so every
 * session started with the instructor reading six characters out loud twice.
 */
export function ShareSessionDialog({ onClose }: { onClose: () => void }) {
  const session = useAppStore((s) => s.session);
  const backendUrl = useAppStore((s) => s.settings.backendUrl);
  const [studentUrl, setStudentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function savePassword() {
    if (!session || savingPassword) return;
    setSavingPassword(true);
    setPasswordError(null);
    try {
      const { passwordRequired } = await updateSessionPassword(
        session.id,
        backendUrl,
        newPassword.trim(),
        session.instructorToken
      );
      useAppStore.getState().setSession({ ...session, passwordRequired });
      setNewPassword("");
      setChangingPassword(false);
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not update the password.");
    } finally {
      setSavingPassword(false);
    }
  }

  useEffect(() => {
    fetch(`${backendUrl}/api/network-info`)
      .then((r) => r.json())
      .then((info: { studentUrl?: string | null }) => setStudentUrl(info?.studentUrl ?? null))
      .catch(() => setStudentUrl(null));
  }, [backendUrl]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!session) return null;

  const joinLink = studentUrl
    ? `${studentUrl.replace(/\/$/, "")}/room/${session.roomCode}`
    : null;

  async function copy(kind: "code" | "link", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      useAppStore.getState().addDebugLog("Could not write to the clipboard", "warn");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Invite students"
        className="w-full max-w-md space-y-5 rounded-2xl border border-wkai-border bg-wkai-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-wkai-text">Invite students</h2>
            <p className="text-xs text-wkai-text-dim">
              They enter this code at the join page, or open the link directly.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-wkai-text-dim hover:text-wkai-text"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* The code, at the size a room full of people can read off a projector. */}
        <div className="rounded-xl border border-wkai-border bg-wkai-bg p-5 text-center">
          <p className="text-[11px] uppercase tracking-wide text-wkai-text-dim">Room code</p>
          <p className="selectable mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-accent-text">
            {session.roomCode}
          </p>
          <button
            className="btn-secondary btn-sm mx-auto mt-3"
            onClick={() => void copy("code", session.roomCode)}
          >
            {copied === "code" ? <Check size={14} /> : <Copy size={14} />}
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-wkai-text-dim">Join link</p>
          {joinLink ? (
            <div className="flex items-center gap-2">
              <code className="selectable min-w-0 flex-1 truncate rounded-lg border border-wkai-border bg-wkai-bg px-3 py-2 font-mono text-xs text-wkai-text">
                {joinLink}
              </code>
              <button
                className={clsx("btn-secondary btn-sm shrink-0")}
                onClick={() => void copy("link", joinLink)}
              >
                {copied === "link" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "link" ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-wkai-text-dim">
              No student URL is available from the backend yet — read the code out instead.
            </p>
          )}
        </div>

        {/* The password is stored as a hash and kept nowhere on this machine, so
            there is nothing to look up when an instructor forgets it. Setting a
            new one and reading it out is the way back in — students already in
            the room hold their own tokens and are not disconnected. */}
        <div className="space-y-2 border-t border-wkai-border pt-4">
          {!changingPassword ? (
            <button
              className="btn-secondary btn-sm w-full"
              onClick={() => {
                setChangingPassword(true);
                setPasswordError(null);
                setPasswordSaved(false);
              }}
            >
              <KeyRound size={14} />
              {session.passwordRequired ? "Change room password" : "Set a room password"}
            </button>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void savePassword();
              }}
            >
              <label
                htmlFor="new-room-password"
                className="block text-[11px] uppercase tracking-wide text-wkai-text-dim"
              >
                New room password
              </label>
              <input
                id="new-room-password"
                name="new-room-password"
                className="input h-10 text-sm"
                type="text"
                placeholder="Leave empty to remove the password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                maxLength={128}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                autoFocus
              />
              <p className="text-xs text-wkai-text-dim">
                Shown as plain text so you can read it out to the room. Students already
                joined stay connected.
              </p>
              {passwordError && (
                <p role="alert" className="text-xs text-danger">
                  {passwordError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setChangingPassword(false);
                    setNewPassword("");
                    setPasswordError(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary btn-sm" disabled={savingPassword}>
                  {savingPassword ? "Saving…" : "Save password"}
                </button>
              </div>
            </form>
          )}

          {passwordSaved && !changingPassword && (
            <p className="text-xs text-accent-text">
              {session.passwordRequired
                ? "Password updated. Read the new one out to the room."
                : "Password removed — the room code is now enough to join."}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
