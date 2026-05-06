// src/infrastructure/pg-expense.repository.ts
//
// EXERCICE 4 — À COMPLÉTER
//
// Implémentation Postgres du ExpenseRepository.
// À tester avec Testcontainers (voir SUJET.md exercice 4).

import type { Pool } from 'pg';
import type { Expense } from '../domain/types';
import type { ExpenseRepository } from '../ports/expense.repository';

type DbExpenseRow = {
  id: string;
  group_id: string;
  description: string;
  amount: string | number;
  currency: Expense['currency'];
  paid_by: string;
  paid_at: Date;
  split_mode: Expense['split']['mode'];
  split_data: unknown;
  category: string | null;
  created_at: Date;
};

export class PgExpenseRepository implements ExpenseRepository {
  constructor(private readonly pool: Pool) {}

  async save(expense: Expense): Promise<void> {
    const { mode } = expense.split;
    const splitData =
      mode === 'equal'
        ? { beneficiaries: expense.split.beneficiaries }
        : mode === 'weighted'
          ? { weights: expense.split.weights }
          : { percentages: expense.split.percentages };

    await this.pool.query(
      `INSERT INTO expenses
        (id, group_id, description, amount, currency, paid_by, paid_at, split_mode, split_data, category, created_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [
        expense.id,
        expense.groupId,
        expense.description,
        expense.amount,
        expense.currency,
        expense.paidBy,
        expense.paidAt,
        mode,
        JSON.stringify(splitData),
        expense.category ?? null,
        expense.createdAt,
      ],
    );
  }

  async findById(id: string): Promise<Expense | null> {
    const res = await this.pool.query<DbExpenseRow>(
      `SELECT id, group_id, description, amount, currency, paid_by, paid_at,
              split_mode, split_data, category, created_at
         FROM expenses
        WHERE id = $1`,
      [id],
    );
    if (res.rowCount === 0) return null;
    return this.mapRow(res.rows[0]!);
  }

  async findByGroupId(groupId: string): Promise<Expense[]> {
    const res = await this.pool.query<DbExpenseRow>(
      `SELECT id, group_id, description, amount, currency, paid_by, paid_at,
              split_mode, split_data, category, created_at
         FROM expenses
        WHERE group_id = $1
        ORDER BY paid_at DESC, id ASC`,
      [groupId],
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  async findInDateRange(
    groupId: string,
    from: Date,
    to: Date,
  ): Promise<Expense[]> {
    const res = await this.pool.query<DbExpenseRow>(
      `SELECT id, group_id, description, amount, currency, paid_by, paid_at,
              split_mode, split_data, category, created_at
         FROM expenses
        WHERE group_id = $1
          AND paid_at >= $2
          AND paid_at <= $3
        ORDER BY paid_at DESC, id ASC`,
      [groupId, from, to],
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: DbExpenseRow): Expense {
    const amount = typeof row.amount === 'string' ? Number(row.amount) : row.amount;
    const splitData = (row.split_data ?? {}) as any;

    const split =
      row.split_mode === 'equal'
        ? { mode: 'equal' as const, beneficiaries: (splitData.beneficiaries ?? []) as string[] }
        : row.split_mode === 'weighted'
          ? { mode: 'weighted' as const, weights: (splitData.weights ?? {}) as Record<string, number> }
          : {
              mode: 'percentage' as const,
              percentages: (splitData.percentages ?? {}) as Record<string, number>,
            };

    return {
      id: row.id,
      groupId: row.group_id,
      description: row.description,
      amount,
      currency: row.currency,
      paidBy: row.paid_by,
      paidAt: new Date(row.paid_at),
      split,
      category: row.category ?? undefined,
      createdAt: new Date(row.created_at),
    };
  }
}
