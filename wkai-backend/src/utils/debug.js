const ENABLE_VERBOSE =
  String(process.env.WKAI_DEBUG_VERBOSE ?? "").toLowerCase() === "1" ||
  String(process.env.WKAI_DEBUG_VERBOSE ?? "").toLowerCase() === "true" ||
  process.env.NODE_ENV !== "production";

function now() {
  return new Date().toISOString();
}

function serialize(value) {
  try {
    const raw = JSON.stringify(value);
    if (!raw) return "";
    return raw.length > 1200 ? `${raw.slice(0, 1200)}...<truncated>` : raw;
  } catch {
    return String(value);
  }
}

export function debugLog(scope, message, context = undefined) {
  if (!ENABLE_VERBOSE) return;
  if (context === undefined) {
    console.log(`[DBG ${now()}] [${scope}] ${message}`);
    return;
  }
  console.log(`[DBG ${now()}] [${scope}] ${message} ${serialize(context)}`);
}

export function debugError(scope, message, err) {
  const data = {
    message: err?.message ?? String(err),
    stack: err?.stack,
  };
  console.error(`[DBG ${now()}] [${scope}] ${message} ${serialize(data)}`);
}

export function debugEnabled() {
  return ENABLE_VERBOSE;
}
