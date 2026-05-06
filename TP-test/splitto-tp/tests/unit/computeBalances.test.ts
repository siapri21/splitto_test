import { describe, expect, it } from 'vitest';
import { computeBalances } from '../../src/domain/balances';
import type { Expense, Group, Member } from '../../src/domain/types';

const m = (id: string): Member => ({ id, name: id.toUpperCase(), email: `${id}@example.com` });
const d = (iso = '2026-01-01T00:00:00.000Z') => new Date(iso);

const baseGroup = (memberIds: string[]): Group => ({
  id: 'g1',
  name: 'Trip',
  currency: 'EUR',
  members: memberIds.map(m),
});

const expense = (partial: Omit<Expense, 'id' | 'createdAt' | 'currency'> & Partial<Pick<Expense, 'currency'>>): Expense => ({
  id: crypto.randomUUID(),
  createdAt: d('2026-01-01T00:00:00.000Z'),
  currency: 'EUR',
  description: 'x',
  ...partial,
});

const expectSumZeroCents = (...amounts: number[]) => {
  const cents = Math.round(amounts.reduce((acc, n) => acc + n, 0) * 100);
  expect(Math.abs(cents)).toBe(0);
};

describe('computeBalances', () => {
  it('groupe vide → {}', () => {
    const group = baseGroup([]);
    const balances = computeBalances(group, []);
    expect(balances).toEqual({});
  });

  it("equal entre 3 (payeur inclus comme bénéficiaire)", () => {
    const group = baseGroup(['a', 'b', 'c']);
    const balances = computeBalances(group, [
      expense({
        groupId: group.id,
        amount: 30,
        paidBy: 'a',
        paidAt: d(),
        split: { mode: 'equal', beneficiaries: ['a', 'b', 'c'] },
        description: 'Dinner',
      }),
    ]);

    expect(balances).toEqual({ a: 20, b: -10, c: -10 });
  });

  it("equal entre 3 (payeur PAS bénéficiaire)", () => {
    const group = baseGroup(['a', 'b', 'c']);
    const balances = computeBalances(group, [
      expense({
        groupId: group.id,
        amount: 30,
        paidBy: 'a',
        paidAt: d(),
        split: { mode: 'equal', beneficiaries: ['b', 'c'] },
        description: 'Taxi',
      }),
    ]);

    expect(balances).toEqual({ a: 30, b: -15, c: -15 });
  });

  it('plusieurs dépenses qui se compensent partiellement', () => {
    const group = baseGroup(['a', 'b', 'c']);
    const balances = computeBalances(group, [
      expense({
        groupId: group.id,
        amount: 30,
        paidBy: 'a',
        paidAt: d(),
        split: { mode: 'equal', beneficiaries: ['a', 'b', 'c'] },
        description: 'Meal',
      }),
      expense({
        groupId: group.id,
        amount: 15,
        paidBy: 'b',
        paidAt: d(),
        split: { mode: 'equal', beneficiaries: ['a', 'b'] },
        description: 'Tickets',
      }),
    ]);

    expect(balances).toEqual({ a: 12.5, b: -2.5, c: -10 });
    expectSumZeroCents(balances.a, balances.b, balances.c);
  });

  it('weighted avec poids non-uniformes', () => {
    const group = baseGroup(['a', 'b', 'c']);
    const balances = computeBalances(group, [
      expense({
        groupId: group.id,
        amount: 60,
        paidBy: 'a',
        paidAt: d(),
        split: { mode: 'weighted', weights: { a: 1, b: 2, c: 3 } },
        description: 'Hotel',
      }),
    ]);

    expect(balances).toEqual({ a: 50, b: -20, c: -30 });
  });

  it("percentage avec arrondis (100€ entre 3 = 33.33 + 33.33 + 33.34)", () => {
    const group = baseGroup(['a', 'b', 'c']);
    const balances = computeBalances(group, [
      expense({
        groupId: group.id,
        amount: 100,
        paidBy: 'a',
        paidAt: d(),
        split: { mode: 'percentage', percentages: { a: 33.33, b: 33.33, c: 33.34 } },
        description: 'House',
      }),
    ]);

    expect(balances).toEqual({ a: 66.67, b: -33.33, c: -33.34 });
    expectSumZeroCents(balances.a, balances.b, balances.c);
  });

  it('membre supprimé qui figure dans une vieille dépense', () => {
    const group = baseGroup(['a', 'b']);
    const balances = computeBalances(group, [
      expense({
        groupId: group.id,
        amount: 10,
        paidBy: 'a',
        paidAt: d(),
        split: { mode: 'equal', beneficiaries: ['b', 'x'] },
        description: 'Old expense with deleted member',
      }),
    ]);

    expect(balances).toEqual({ a: 10, b: -5, x: -5 });
    expectSumZeroCents(balances.a, balances.b, balances.x);
  });

  it('dépense avec un seul bénéficiaire (le payeur lui-même) → solde nul', () => {
    const group = baseGroup(['a']);
    const balances = computeBalances(group, [
      expense({
        groupId: group.id,
        amount: 12,
        paidBy: 'a',
        paidAt: d(),
        split: { mode: 'equal', beneficiaries: ['a'] },
        description: 'Self',
      }),
    ]);

    expect(balances).toEqual({ a: 0 });
  });

  it('pourcentages qui ne somment pas exactement à 100 (normalisation)', () => {
    const group = baseGroup(['a', 'b', 'c']);
    const balances = computeBalances(group, [
      expense({
        groupId: group.id,
        amount: 100,
        paidBy: 'a',
        paidAt: d(),
        split: { mode: 'percentage', percentages: { a: 50, b: 25, c: 20 } }, // somme = 95
        description: 'Not 100%',
      }),
    ]);

    expect(balances).toEqual({ a: 47.37, b: -26.32, c: -21.05 });
    expectSumZeroCents(balances.a, balances.b, balances.c);
  });
});

