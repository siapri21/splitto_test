import { describe, expect, it, vi } from 'vitest';
import { ExpenseService } from '../../src/domain/expense.service';
import type { CreateExpenseInput, Expense } from '../../src/domain/types';
import type { Clock } from '../../src/ports/clock';
import type { EmailNotifier } from '../../src/ports/notifier';
import type { ExpenseRepository } from '../../src/ports/expense.repository';
import type { IdGenerator } from '../../src/ports/id-generator';
import type { Logger } from '../../src/ports/logger';

// ─── DUMMY ──────────────────────────────────────
// Implémentation minimale, jamais vérifiée dans les tests.
const dummyLogger: Logger = {
  info: () => {},
  error: () => {},
};

// ─── STUB ───────────────────────────────────────
// Retourne toujours la même date pour rendre le test déterministe.
const fixedNow = new Date('2026-01-01T00:00:00.000Z');
const stubClock: Clock = {
  now: () => fixedNow,
};

// ─── FAKE ───────────────────────────────────────
// Implémentation “en mémoire” (comme un mini repository) pour pouvoir vérifier le contenu après save.
class FakeExpenseRepository implements ExpenseRepository {
  private readonly byId = new Map<string, Expense>();

  async save(expense: Expense): Promise<void> {
    this.byId.set(expense.id, expense);
  }

  async findById(id: string): Promise<Expense | null> {
    return this.byId.get(id) ?? null;
  }

  async findByGroupId(groupId: string): Promise<Expense[]> {
    return [...this.byId.values()].filter((e) => e.groupId === groupId);
  }

  async findInDateRange(groupId: string, from: Date, to: Date): Promise<Expense[]> {
    return [...this.byId.values()].filter(
      (e) => e.groupId === groupId && e.paidAt >= from && e.paidAt <= to,
    );
  }
}

// Petit helper partagé
const makeInput = (amount: number): CreateExpenseInput => ({
  groupId: 'g1',
  description: 'Hotel',
  amount,
  currency: 'EUR',
  paidBy: 'a',
  paidAt: new Date('2026-01-01T10:00:00.000Z'),
  split: { mode: 'equal', beneficiaries: ['a'] },
  category: 'travel',
});

describe('ExpenseService.create', () => {
  it("retourne la bonne expense et appelle le notifier si amount >= 100", async () => {
    const repo = new FakeExpenseRepository();

    const stubIdGen: IdGenerator = { next: () => 'e-1' };

    // ─── SPY ────────────────────────────────────────
    // On observe des appels (sans imposer un scénario complet).
    const spyLogger = { info: vi.fn(), error: vi.fn() } satisfies Logger;

    // ─── MOCK ───────────────────────────────────────
    // On impose une expectation: doit être appelé avec groupId + message attendu.
    const mockNotifier: EmailNotifier = {
      notifyGroupMembers: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ExpenseService(repo, mockNotifier, stubClock, stubIdGen, spyLogger);

    const input = makeInput(120);
    const created = await service.create(input);

    expect(created).toEqual({
      ...input,
      id: 'e-1',
      createdAt: fixedNow,
    });

    expect(await repo.findById('e-1')).toEqual(created);

    expect(mockNotifier.notifyGroupMembers).toHaveBeenCalledTimes(1);
    expect(mockNotifier.notifyGroupMembers).toHaveBeenCalledWith(
      'g1',
      'Nouvelle dépense importante : Hotel (120€)',
    );

    expect(spyLogger.info).toHaveBeenCalledWith('Expense e-1 created');
  });

  it("n'appelle PAS le notifier si amount < 100", async () => {
    const repo = new FakeExpenseRepository();
    const stubIdGen: IdGenerator = { next: () => 'e-2' };

    const spyLogger = { info: vi.fn(), error: vi.fn() } satisfies Logger;

    const mockNotifier: EmailNotifier = {
      notifyGroupMembers: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ExpenseService(repo, mockNotifier, stubClock, stubIdGen, dummyLogger);

    const input = makeInput(99);
    const created = await service.create(input);

    expect(created.id).toBe('e-2');
    expect(await repo.findById('e-2')).toEqual(created);

    expect(mockNotifier.notifyGroupMembers).not.toHaveBeenCalled();
    expect(spyLogger.info).not.toHaveBeenCalled();
  });
});

