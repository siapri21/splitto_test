import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Verifier } from '@pact-foundation/pact';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';

import { createApp } from '../../../src/server';

const migrationPath = join(process.cwd(), 'migrations', '001-initial.sql');

describe('Pact provider: splitto-api', () => {
  let container: PostgreSqlContainer;
  let pool: Pool;
  let server: Server;
  let baseUrl: string;

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

    const app = createApp(pool);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Server did not start');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end().catch(() => {});
    await container?.stop().catch(() => {});
  }, 60_000);

  it('verifies pacts', async () => {
    const output = await new Verifier({
      providerBaseUrl: baseUrl,
      pactUrls: [join(process.cwd(), 'pacts', 'splitto-frontend-splitto-api.json')],
      stateHandlers: {
        'aucun groupe inexistant': async () => {
          await pool.query('TRUNCATE groups CASCADE');
        },
        'group-1 a 3 membres et 2 dépenses': async () => {
          await pool.query('TRUNCATE groups CASCADE');

          await pool.query(`INSERT INTO groups (id, name, currency) VALUES ('group-1', 'Trip', 'EUR')`);
          await pool.query(
            `INSERT INTO members (id, group_id, name, email)
             VALUES
              ('a', 'group-1', 'Alice', 'a@example.com'),
              ('b', 'group-1', 'Bob', 'b@example.com'),
              ('c', 'group-1', 'Charlie', 'c@example.com')`,
          );

          await pool.query(
            `INSERT INTO expenses
              (id, group_id, description, amount, currency, paid_by, paid_at, split_mode, split_data, category, created_at)
             VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
            [
              'e1',
              'group-1',
              'Dinner',
              30,
              'EUR',
              'a',
              new Date('2026-01-02T10:00:00.000Z'),
              'equal',
              JSON.stringify({ beneficiaries: ['a', 'b', 'c'] }),
              null,
              new Date('2026-01-02T10:00:00.000Z'),
            ],
          );

          await pool.query(
            `INSERT INTO expenses
              (id, group_id, description, amount, currency, paid_by, paid_at, split_mode, split_data, category, created_at)
             VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
            [
              'e2',
              'group-1',
              'Tickets',
              15,
              'EUR',
              'b',
              new Date('2026-01-03T10:00:00.000Z'),
              'equal',
              JSON.stringify({ beneficiaries: ['a', 'b'] }),
              null,
              new Date('2026-01-03T10:00:00.000Z'),
            ],
          );
        },
      },
    }).verifyProvider();

    expect(output).toBeTruthy();
  }, 120_000);
});

