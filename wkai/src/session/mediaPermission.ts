import { create } from "zustand";

export type MediaPermissionKind = "microphone" | "camera";
export type MediaPermissionPhase = "ask" | "denied";

type PendingRequest = {
  kind: MediaPermissionKind;
  phase: MediaPermissionPhase;
  /** Why the app wants it, in the instructor's terms. */
  reason: string;
  error?: string;
};

type PermissionStore = {
  pending: PendingRequest | null;
  setPending: (pending: PendingRequest | null) => void;
};

/**
 * Deliberately its own tiny store rather than a slice of the app store: the
 * dialog has to be mounted app-wide and answered before capture continues, and
 * nothing else in the app cares about this state.
 */
export const useMediaPermissionStore = create<PermissionStore>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));

let resolveDecision: ((allowed: boolean) => void) | null = null;

/** Called by the dialog. */
export function answerMediaPermission(allowed: boolean) {
  useMediaPermissionStore.getState().setPending(null);
  resolveDecision?.(allowed);
  resolveDecision = null;
}

function waitForDecision() {
  return new Promise<boolean>((resolve) => {
    resolveDecision = resolve;
  });
}

/**
 * Ask for a device the way an app should: explain first, in a dialog the
 * instructor has to answer, then hit the OS prompt. The previous flow fired
 * getUserMedia unannounced and reported a refusal as a line in the activity
 * log — so an instructor who dismissed the OS prompt taught a whole session
 * with no audio and no idea why.
 */
export async function requestMediaWithConsent(
  kind: MediaPermissionKind,
  reason: string,
  constraints: MediaStreamConstraints
): Promise<MediaStream | null> {
  const { setPending } = useMediaPermissionStore.getState();

  // Already granted in this webview — no need to ask twice.
  let alreadyGranted = false;
  try {
    const status = await navigator.permissions.query({
      name: kind as PermissionName,
    });
    alreadyGranted = status.state === "granted";
    if (status.state === "denied") {
      setPending({ kind, phase: "denied", reason });
      return null;
    }
  } catch {
    // Permissions API not available for this device kind; fall through and ask.
  }

  if (!alreadyGranted) {
    setPending({ kind, phase: "ask", reason });
    const allowed = await waitForDecision();
    if (!allowed) return null;
  }

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    setPending({
      kind,
      phase: "denied",
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
