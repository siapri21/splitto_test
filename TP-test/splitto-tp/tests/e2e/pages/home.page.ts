import type { Page, Locator } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async openNewGroupDialog() {
    await this.page.getByRole('button', { name: 'Nouveau groupe' }).click();
    await this.page.getByRole('dialog', { name: 'Créer un groupe' }).waitFor();
  }

  newGroupDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Créer un groupe' });
  }

  async createGroup(params: {
    name: string;
    currency: 'EUR' | 'USD' | 'GBP' | 'CHF';
    members: Array<{ name: string; email: string }>;
  }) {
    await this.openNewGroupDialog();
    const dlg = this.newGroupDialog();

    await dlg.getByLabel('Nom du groupe').fill(params.name);
    await dlg.getByLabel('Devise').selectOption(params.currency);

    const membersText = params.members.map((m) => `${m.name} <${m.email}>`).join('\n');
    await dlg.getByLabel(/Membres/).fill(membersText);

    await dlg.getByRole('button', { name: 'Créer' }).click();
  }

  groupCardByName(name: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }

  async openGroupByName(name: string) {
    await this.groupCardByName(name).click();
    await this.page.getByRole('heading', { name }).waitFor();
  }
}

