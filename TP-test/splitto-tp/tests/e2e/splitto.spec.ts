import { test, expect } from '@playwright/test';
import { HomePage } from './pages/home.page';
import { GroupPage } from './pages/group.page';

test.beforeEach(async ({ request }) => {
  await request.post('/_test/reset');
});

test('Créer un groupe avec 3 membres', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();

  await home.createGroup({
    name: 'Voyage',
    currency: 'EUR',
    members: [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
      { name: 'Charlie', email: 'charlie@example.com' },
    ],
  });

  await expect(home.groupCardByName('Voyage')).toBeVisible();
});

test('Ajouter une dépense et la voir dans la liste', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();

  await home.createGroup({
    name: 'Voyage',
    currency: 'EUR',
    members: [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
      { name: 'Charlie', email: 'charlie@example.com' },
    ],
  });

  await home.openGroupByName('Voyage');
  const group = new GroupPage(page);

  await group.addExpense({
    description: 'Dîner',
    amount: '30',
    paidByName: 'Alice',
    beneficiariesNames: ['Alice', 'Bob', 'Charlie'],
  });

  await expect(group.expensesTable()).toBeVisible();
  await expect(group.expensesTable().getByRole('cell', { name: 'Dîner' })).toBeVisible();
});

test('Voir les soldes mis à jour après une dépense de 30€ payée par Alice pour 3', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();

  await home.createGroup({
    name: 'Voyage',
    currency: 'EUR',
    members: [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
      { name: 'Charlie', email: 'charlie@example.com' },
    ],
  });

  await home.openGroupByName('Voyage');
  const group = new GroupPage(page);

  await group.addExpense({
    description: 'Dîner',
    amount: '30',
    paidByName: 'Alice',
    beneficiariesNames: ['Alice', 'Bob', 'Charlie'],
  });

  await expect(group.balanceCellForMemberName('Alice')).toContainText('20.00 EUR');
  await expect(group.balanceCellForMemberName('Bob')).toContainText('-10.00 EUR');
  await expect(group.balanceCellForMemberName('Charlie')).toContainText('-10.00 EUR');
});

test('Marquer un règlement comme « réglé » et vérifier qu’il disparaît', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();

  await home.createGroup({
    name: 'Voyage',
    currency: 'EUR',
    members: [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
      { name: 'Charlie', email: 'charlie@example.com' },
    ],
  });

  await home.openGroupByName('Voyage');
  const group = new GroupPage(page);

  await group.addExpense({
    description: 'Dîner',
    amount: '30',
    paidByName: 'Alice',
    beneficiariesNames: ['Alice', 'Bob', 'Charlie'],
  });

  await expect(group.settlementsTable()).toBeVisible();
  const firstRow = group.settlementsTable().getByRole('row').nth(1); // header is row 0
  await expect(firstRow).toBeVisible();

  await group.settleFirst();

  await expect(firstRow).toHaveCount(0);
  await expect(group.alert()).toContainText('Règlement marqué comme effectué');
});

