export interface HandoffParse {
  isHandoff: boolean;
  reason: string;
  /** Texto visível ao cliente, já SEM o marcador (vazio quando a resposta era só o marcador). */
  cleanedText: string;
}

// Detecta o marcador em QUALQUER posição da mensagem (início, meio ou fim) — sem âncora `^`.
// Assim o marcador nunca vaza pro cliente, mesmo que o agente escreva uma resposta antes dele.
const MARKER = /\[\[\s*handoff\s*\]\]/i;

export function parseHandoff(text: string): HandoffParse {
  const idx = text.search(MARKER);
  if (idx === -1) return { isHandoff: false, reason: '', cleanedText: text };
  const before = text.slice(0, idx).trim();
  const after = text.slice(idx).replace(MARKER, '').trim();
  return { isHandoff: true, reason: after, cleanedText: before };
}
