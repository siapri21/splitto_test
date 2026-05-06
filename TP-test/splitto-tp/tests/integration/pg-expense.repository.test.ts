import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PgExpenseRepository } from '../../src/infrastructure/pg-expense.repository';
import type { Expense } from '../../src/domain/types';

const migrationPath = join(process.cwd(), 'migrations', '001-initial.sql');

const expense = (partial: Partial<Expense> & Pick<Expense, 'id' | 'groupId' | 'amount' | 'paidBy' | 'paidAt'>): Expense => ({
  id: partial.id,
  groupId: partial.groupId,
  description: partial.description ?? 'Dinner',
  amount: partial.amount,
  currency: partial.currency ?? 'EUR',
  paidBy: partial.paidBy,
  paidAt: partial.paidAt,
  split: partial.split ?? { mode: 'equal', beneficiaries: [partial.paidBy] },
  createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
  category: partial.category,
});

describe('PgExpenseRepository (integration)', () => {
  let container: PostgreSqlContainer;
  let pool: Pool;
  let repo: PgExpenseRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    pool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      user: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    });

    const sql = await readFile(migrationPath, 'utf-8');
    await pool.query(sql);

    repo = new PgExpenseRepository(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, 60_000);

  beforeEach(async () => {
    // Reset complet pour éviter les collisions de PK entre tests
    await pool.query('TRUNCATE groups CASCADE');
    await pool.query(`INSERT INTO groups (id, name, currency) VALUES ('g1', 'Trip', 'EUR')`);
    await pool.query(`INSERT INTO groups (id, name, currency) VALUES ('g2', 'Other', 'EUR')`);
    await pool.query(
      `INSERT INTO members (id, group_id, name, email)
       VALUES
        ('a', 'g1', 'Alice', 'a@example.com'),
        ('b', 'g1', 'Bob', 'b@example.com'),
        ('c', 'g2', 'Charlie', 'c@example.com')`,
    );
  });

  it('save() puis findById() retourne l’expense identique', async () => {
    const e = expense({
      id: 'e1',
      groupId: 'g1',
      amount: 12.5,
      paidBy: 'a',
      paidAt: new Date('2026-01-02T10:00:00.000Z'),
      split: { mode: 'percentage', percentages: { a: 50, b: 50 } },
      category: 'food',
    });

    await repo.save(e);
    const loaded = await repo.findById('e1');
    expect(loaded).toEqual(e);
  });

  it('findByGroupId() retourne uniquement les expenses du groupe demandé', async () => {
    await repo.save(
      expense({
        id: 'e1',
        groupId: 'g1',
        amount: 10,
        paidBy: 'a',
        paidAt: new Date('2026-01-02T10:00:00.000Z'),
      }),
    );
    await repo.save(
      expense({
        id: 'e2',
        groupId: 'g2',
        amount: 20,
        paidBy: 'c',
        paidAt: new Date('2026-01-03T10:00:00.000Z'),
      }),
    );

    const g1 = await repo.findByGroupId('g1');
    expect(g1.map((x) => x.id)).toEqual(['e1']);
  });

  it('findInDateRange() filtre correctement (inclusif sur les bornes)', async () => {
    await repo.save(
      expense({
        id: 'e1',
        groupId: 'g1',
        amount: 10,
        paidBy: 'a',
        paidAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    await repo.save(
      expense({
        id: 'e2',
        groupId: 'g1',
        amount: 20,
        paidBy: 'b',
        paidAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );
    await repo.save(
      expense({
        id: 'e3',
        groupId: 'g1',
        amount: 30,
        paidBy: 'a',
        paidAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
    );

    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-02T00:00:00.000Z');
    const res = await repo.findInDateRange('g1', from, to);
    expect(res.map((x) => x.id).sort()).toEqual(['e1', 'e2']);
  });

  it('UNIQUE(group_id, paid_at, amount, paid_by) rejette un doublon', async () => {
    const base = expense({
      id: 'e1',
      groupId: 'g1',
      amount: 10,
      paidBy: 'a',
      paidAt: new Date('2026-01-02T10:00:00.000Z'),
    });
    await repo.save(base);

    await expect(
      repo.save({
        ...base,
        id: 'e2',
        description: 'Duplicate but different id',
      }),
    ).rejects.toBeTruthy();
  });

  it('transaction qui échoue à mi-parcours rollback (aucune ligne sauvegardée)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO expenses
          (id, group_id, description, amount, currency, paid_by, paid_at, split_mode, split_data, category, created_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
        [
          't1',
          'g1',
          'ok',
          10,
          'EUR',
          'a',
          new Date('2026-01-02T10:00:00.000Z'),
          'equal',
          JSON.stringify({ beneficiaries: ['a'] }),
          null,
          new Date('2026-01-01T00:00:00.000Z'),
        ],
      );

      // Deuxième insert: viole la contrainte UNIQUE => doit faire échouer la transaction
      await client.query(
        `INSERT INTO expenses
          (id, group_id, description, amount, currency, paid_by, paid_at, split_mode, split_data, category, created_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
        [
          't2',
          'g1',
          'duplicate',
          10,
          'EUR',
          'a',
          new Date('2026-01-02T10:00:00.000Z'),
          'equal',
          JSON.stringify({ beneficiaries: ['a'] }),
          null,
          new Date('2026-01-01T00:00:00.000Z'),
        ],
      );

      await client.query('COMMIT');
      throw new Error('Expected transaction to fail');
    } catch {
      // rollback manuel : on vérifie ensuite qu'aucune ligne n'a été persistée
      await client.query('ROLLBACK').catch(() => {});
      const after = await pool.query(`SELECT COUNT(*)::int AS c FROM expenses`);
      expect(after.rows[0]!.c).toBe(0);
    } finally {
      client.release();
    }
  });
});

