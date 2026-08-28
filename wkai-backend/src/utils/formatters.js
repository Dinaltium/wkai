/**
 * Row → API shape mappers for the payloads that are sent over both HTTP and the
 * WebSocket. Shared so the two transports cannot drift apart: `session-state`
 * must carry exactly what the join response carries, or a reconnecting client
 * ends up with a different view of the room than one that just joined.
 */

export function formatGuideBlock(row) {
  return {
    id:        row.id,
    sessionId: row.session_id,
    type:      row.type,
    title:     row.title,
    content:   row.content,
    code:      row.code,
    language:  row.language,
    locked:    row.locked,
    timestamp: row.created_at,
  };
}

export function formatSharedFile(row) {
  return {
    id:        row.id,
    name:      row.name,
    url:       row.url,
    sizeBytes: row.size_bytes,
    sharedAt:  row.shared_at,
  };
}
