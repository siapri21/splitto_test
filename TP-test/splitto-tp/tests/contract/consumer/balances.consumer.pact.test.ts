import { describe, expect, it } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'node:path';

const { like, eachLike } = MatchersV3;

async function getBalances(baseUrl: string, groupId: string) {
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/balances`, {
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe('Pact consumer: splitto-frontend -> splitto-api', () => {
  const provider = new PactV3({
    consumer: 'splitto-frontend',
    provider: 'splitto-api',
    dir: resolve(process.cwd(), 'pacts'),
  });

  it('GET /api/groups/group-1/balances -> 200 (groupe avec dépenses)', async () => {
    provider
      .given('group-1 a 3 membres et 2 dépenses')
      .uponReceiving('une requête pour obtenir les balances du groupe group-1')
      .withRequest({
        method: 'GET',
        path: '/api/groups/group-1/balances',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: like({
          groupId: like('group-1'),
          balances: like({
            a: like(12.5),
            b: like(-2.5),
            c: like(-10),
          }),
          settlements: eachLike(
            {
              from: like('c'),
              to: like('a'),
              amount: like(10),
            },
            1,
          ),
        }),
      });

    await provider.executeTest(async (mockServer) => {
      const { status, body } = await getBalances(mockServer.url, 'group-1');
      expect(status).toBe(200);
      expect(body).toBeTruthy();
      expect(body.groupId).toBe('group-1');
    });
  });

  it("GET /api/groups/inexistant/balances -> 404 (groupe n'existe pas)", async () => {
    provider
      .given('aucun groupe inexistant')
      .uponReceiving("une requête pour obtenir les balances d'un groupe inexistant")
      .withRequest({
        method: 'GET',
        path: '/api/groups/inexistant/balances',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: like({ error: like('Group not found') }),
      });

    await provider.executeTest(async (mockServer) => {
      const { status, body } = await getBalances(mockServer.url, 'inexistant');
      expect(status).toBe(404);
      expect(body).toEqual({ error: 'Group not found' });
    });
  });
});

