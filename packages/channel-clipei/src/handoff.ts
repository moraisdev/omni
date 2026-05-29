export interface HandoffParse {
  isHandoff: boolean;
  reason: string;
}

const MARKER = /^\s*\[\[handoff\]\]\s*/i;

export function parseHandoff(text: string): HandoffParse {
  if (!MARKER.test(text)) return { isHandoff: false, reason: '' };
  const reason = text.replace(MARKER, '').trim();
  return { isHandoff: true, reason };
}
