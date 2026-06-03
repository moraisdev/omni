import { describe, expect, it } from 'bun:test';
import { parseHandoff } from './handoff';

describe('parseHandoff', () => {
  it('detects handoff marker and extracts reason', () => {
    expect(parseHandoff('[[HANDOFF]] cliente pediu reembolso')).toEqual({
      isHandoff: true,
      reason: 'cliente pediu reembolso',
      cleanedText: '',
    });
  });
  it('handles marker on its own line', () => {
    const r = parseHandoff('[[HANDOFF]]\nfora do escopo');
    expect(r.isHandoff).toBe(true);
    expect(r.reason).toBe('fora do escopo');
  });
  it('returns false for normal text', () => {
    expect(parseHandoff('Olá! Posso ajudar com isso.')).toEqual({
      isHandoff: false,
      reason: '',
      cleanedText: 'Olá! Posso ajudar com isso.',
    });
  });
  it('is case-insensitive and trims', () => {
    expect(parseHandoff('  [[handoff]] x ').isHandoff).toBe(true);
  });

  // Regressão: marcador no FIM (depois de uma mensagem) tem que ser detectado e removido.
  it('detects marker at the END and strips it from the customer text', () => {
    const r = parseHandoff('Vou te explicar o passo a passo aqui.\n\n[[HANDOFF]] cliente relata restricao no TikTok');
    expect(r.isHandoff).toBe(true);
    expect(r.reason).toBe('cliente relata restricao no TikTok');
    expect(r.cleanedText).toBe('Vou te explicar o passo a passo aqui.');
    expect(r.cleanedText).not.toContain('[[HANDOFF]]');
  });

  // Marcador no MEIO também nunca pode vazar.
  it('detects marker in the MIDDLE and never leaks it', () => {
    const r = parseHandoff('mensagem util [[handoff]] motivo qualquer');
    expect(r.isHandoff).toBe(true);
    expect(r.cleanedText).toBe('mensagem util');
    expect(r.reason).toBe('motivo qualquer');
  });
});
