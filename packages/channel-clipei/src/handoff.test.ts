import { describe, expect, it } from 'bun:test';
import { parseHandoff } from './handoff';

describe('parseHandoff', () => {
  it('detects handoff marker and extracts reason', () => {
    expect(parseHandoff('[[HANDOFF]] cliente pediu reembolso')).toEqual({ isHandoff: true, reason: 'cliente pediu reembolso' });
  });
  it('handles marker on its own line', () => {
    const r = parseHandoff('[[HANDOFF]]\nfora do escopo');
    expect(r.isHandoff).toBe(true);
    expect(r.reason).toBe('fora do escopo');
  });
  it('returns false for normal text', () => {
    expect(parseHandoff('Olá! Posso ajudar com isso.')).toEqual({ isHandoff: false, reason: '' });
  });
  it('is case-insensitive and trims', () => {
    expect(parseHandoff('  [[handoff]] x ').isHandoff).toBe(true);
  });
});
