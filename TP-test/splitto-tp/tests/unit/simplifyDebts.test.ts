import { describe, expect, it } from 'vitest';
import { simplifyDebts } from '../../src/domain/simplify';

describe('simplifyDebts', () => {
  it('2 personnes', () => {
    expect(simplifyDebts({ a: 10, b: -10 })).toEqual([{ from: 'b', to: 'a', amount: 10 }]);
  });

  it('3 personnes en triangle', () => {
    expect(simplifyDebts({ a: 10, b: 0, c: -10 })).toEqual([{ from: 'c', to: 'a', amount: 10 }]);
  });

  it('4 personnes, dette circulaire complexe', () => {
    expect(simplifyDebts({ a: 30, b: -20, c: -10, d: 0 })).toEqual([
      { from: 'b', to: 'a', amount: 20 },
      { from: 'c', to: 'a', amount: 10 },
    ]);
  });

  it('tout le monde à 0 → []', () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });

  it('arrondis: conserve les centimes', () => {
    expect(simplifyDebts({ a: 0.01, b: -0.01 })).toEqual([{ from: 'b', to: 'a', amount: 0.01 }]);
  });
});

