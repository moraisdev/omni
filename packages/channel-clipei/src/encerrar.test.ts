import { describe, expect, it } from 'bun:test';
import { parseEncerrar } from './encerrar';

describe('parseEncerrar', () => {
  it('detects the marker when it is the whole message', () => {
    expect(parseEncerrar('[[ENCERRAR]]')).toEqual({
      isEncerrar: true,
      cleanedText: '',
    });
  });
  it('handles marker on its own line', () => {
    const r = parseEncerrar('[[ENCERRAR]]\n');
    expect(r.isEncerrar).toBe(true);
    expect(r.cleanedText).toBe('');
  });
  it('returns false for normal text', () => {
    expect(parseEncerrar('Posso te ajudar em algo mais? 🤩')).toEqual({
      isEncerrar: false,
      cleanedText: 'Posso te ajudar em algo mais? 🤩',
    });
  });
  it('is case-insensitive and trims', () => {
    expect(parseEncerrar('  [[encerrar]]  ').isEncerrar).toBe(true);
  });

  // O agente pode mandar uma despedida curta antes do marcador — o texto vai ao cliente, o marcador não.
  it('detects marker at the END and strips it from the customer text', () => {
    const r = parseEncerrar('Perfeito, fico à disposição! 😊\n\n[[ENCERRAR]]');
    expect(r.isEncerrar).toBe(true);
    expect(r.cleanedText).toBe('Perfeito, fico à disposição! 😊');
    expect(r.cleanedText).not.toContain('[[ENCERRAR]]');
  });

  // Marcador no MEIO também nunca pode vazar.
  it('detects marker in the MIDDLE and never leaks it', () => {
    const r = parseEncerrar('valeu [[encerrar]] sobra');
    expect(r.isEncerrar).toBe(true);
    expect(r.cleanedText).toBe('valeu');
  });
});
