import type { Page, Locator } from '@playwright/test';

export class GroupPage {
  constructor(private readonly page: Page) {}

  heading(name: string): Locator {
    return this.page.getByRole('heading', { name });
  }

  async openNewExpenseDialog() {
    await this.page.getByRole('button', { name: 'Ajouter une dépense' }).click();
    await this.page.getByRole('dialog', { name: 'Ajouter une dépense' }).waitFor();
  }

  async addExpense(params: {
    description: string;
    amount: string; // keep string for input
    paidByName: string;
    beneficiariesNames: string[];
  }) {
    await this.openNewExpenseDialog();
    const dlg = this.page.getByRole('dialog', { name: 'Ajouter une dépense' });

    await dlg.getByLabel('Description').fill(params.description);
    await dlg.getByLabel('Montant').fill(params.amount);
    await dlg.getByLabel('Payé par').selectOption({ label: params.paidByName });

    // Beneficiaries are checkboxes within labels.
    // We use exact matching to avoid the outer label "Bénéficiaires (cochez)" being
    // concatenated into some accessible names.
    for (const name of params.beneficiariesNames) {
      await dlg.getByRole('checkbox', { name, exact: true }).setChecked(true);
    }

    await dlg.getByRole('button', { name: 'Ajouter' }).click();
  }

  expensesTable(): Locator {
    return this.page.getByRole('table', { name: 'Liste des dépenses' });
  }

  balancesTable(): Locator {
    return this.page.getByRole('table', { name: 'Soldes des membres' });
  }

  settlementsTable(): Locator {
    return this.page.getByRole('table', { name: 'Règlements' });
  }

  balanceCellForMemberName(memberName: string): Locator {
    // Row contains member name + balance cell
    const row = this.balancesTable().getByRole('row', { name: new RegExp(memberName) });
    return row.locator('td').nth(1);
  }

  async settleFirst() {
    await this.settlementsTable().getByRole('button', { name: 'Régler' }).first().click();
  }

  alert(): Locator {
    return this.page.getByRole('alert');
  }
}

