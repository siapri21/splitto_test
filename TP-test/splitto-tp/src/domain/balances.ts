// src/domain/balances.ts — calcul des soldes d'un groupe
//
// EXERCICE 1 — À COMPLÉTER
//
// Spec : voir SUJET.md, exercice 1
//
// Cette fonction est PURE : pas d'effets de bord, pas d'I/O.
// Elle prend un groupe et ses dépenses, retourne les soldes.

import type { Group, Expense, Balances } from './types';

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  const n = cents / 100;
  return Object.is(n, -0) ? 0 : n;
}

function allocateCents(totalCents: number, weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => Number.isFinite(w) && w > 0);
  if (totalCents === 0 || entries.length === 0) return {};

  const sumWeight = entries.reduce((acc, [, w]) => acc + w, 0);
  if (sumWeight <= 0) return {};

  const base: Record<string, number> = {};
  const remainders: Array<{ id: string; rem: number }> = [];

  let used = 0;
  for (const [id, w] of entries) {
    const raw = (totalCents * w) / sumWeight;
    const b = Math.floor(raw);
    base[id] = b;
    used += b;
    remainders.push({ id, rem: raw - b });
  }

  let remaining = totalCents - used;
  if (remaining > 0) {
    remainders.sort((a, b) => (b.rem - a.rem) || a.id.localeCompare(b.id));
    for (let i = 0; i < remaining; i++) {
      const id = remainders[i % remainders.length]!.id;
      base[id] = (base[id] ?? 0) + 1;
    }
  } else if (remaining < 0) {
    remainders.sort((a, b) => (a.rem - b.rem) || a.id.localeCompare(b.id));
    for (let i = 0; i < -remaining; i++) {
      const id = remainders[i % remainders.length]!.id;
      base[id] = (base[id] ?? 0) - 1;
    }
  }

  return base;
}

export function computeBalances(group: Group, expenses: Expense[]): Balances {
  const balancesCents: Record<string, number> = {};
  for (const m of group.members) balancesCents[m.id] = 0;

  for (const e of expenses) {
    if (e.groupId !== group.id) continue;

    const totalCents = toCents(e.amount);
    if (!Number.isFinite(totalCents)) continue;

    balancesCents[e.paidBy] = (balancesCents[e.paidBy] ?? 0) + totalCents;

    if (e.split.mode === 'equal') {
      const beneficiaries = e.split.beneficiaries ?? [];
      if (beneficiaries.length === 0) continue;
      const weights: Record<string, number> = Object.fromEntries(beneficiaries.map((id) => [id, 1]));
      const allocations = allocateCents(totalCents, weights);
      for (const [id, cents] of Object.entries(allocations)) {
        balancesCents[id] = (balancesCents[id] ?? 0) - cents;
      }
      continue;
    }

    if (e.split.mode === 'weighted') {
      const allocations = allocateCents(totalCents, e.split.weights ?? {});
      for (const [id, cents] of Object.entries(allocations)) {
        balancesCents[id] = (balancesCents[id] ?? 0) - cents;
      }
      continue;
    }

    const allocations = allocateCents(totalCents, e.split.percentages ?? {});
    for (const [id, cents] of Object.entries(allocations)) {
      balancesCents[id] = (balancesCents[id] ?? 0) - cents;
    }
  }

  const out: Balances = {};
  for (const [id, cents] of Object.entries(balancesCents)) out[id] = fromCents(cents);
  return out;
}
