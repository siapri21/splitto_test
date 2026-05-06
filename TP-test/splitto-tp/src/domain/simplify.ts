// src/domain/simplify.ts — simplification des dettes
//
// EXERCICE 2 — À COMPLÉTER EN TDD STRICT
//
// Spec : voir SUJET.md, exercice 2
//
// Le but : transformer un dictionnaire de soldes en LISTE MINIMALE
// de règlements pour solder le groupe.

import type { Balances, Settlement } from './types';

export function simplifyDebts(balances: Balances): Settlement[] {
  const toCents = (n: number) => Math.round(n * 100);
  const fromCents = (c: number) => {
    const n = c / 100;
    return Object.is(n, -0) ? 0 : n;
  };

  const creditors: Array<{ id: string; cents: number }> = [];
  const debtors: Array<{ id: string; cents: number }> = [];

  for (const [id, bal] of Object.entries(balances)) {
    const cents = toCents(bal);
    if (cents > 0) creditors.push({ id, cents });
    else if (cents < 0) debtors.push({ id, cents: -cents }); // store as positive magnitude
  }

  // Process biggest amounts first. This tends to minimize the number of settlements
  // by zeroing at least one participant per transaction.
  creditors.sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;

    const pay = Math.min(debtor.cents, creditor.cents);
    if (pay > 0) {
      settlements.push({ from: debtor.id, to: creditor.id, amount: fromCents(pay) });
      debtor.cents -= pay;
      creditor.cents -= pay;
    }

    if (debtor.cents === 0) i++;
    if (creditor.cents === 0) j++;
  }

  return settlements;
}
