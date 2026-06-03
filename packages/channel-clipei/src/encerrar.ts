export interface EncerrarParse {
  isEncerrar: boolean;
  /** Texto visível ao cliente, já SEM o marcador (vazio quando a resposta era só o marcador). */
  cleanedText: string;
}

// Detecta o marcador em QUALQUER posição da mensagem (início, meio ou fim) — sem âncora `^`.
// Assim o marcador nunca vaza pro cliente, mesmo que o agente escreva uma resposta antes dele.
const MARKER = /\[\[\s*encerrar\s*\]\]/i;

export function parseEncerrar(text: string): EncerrarParse {
  const idx = text.search(MARKER);
  if (idx === -1) return { isEncerrar: false, cleanedText: text };
  const before = text.slice(0, idx).trim();
  return { isEncerrar: true, cleanedText: before };
}
