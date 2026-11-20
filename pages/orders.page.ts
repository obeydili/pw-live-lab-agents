import { Page, Locator } from '@playwright/test';

export class OrdersPage {
  private progressBar: Locator;
  private exportCSV: Locator;
  private rows: Locator;
  private cells: Locator;

  constructor(private readonly page: Page) {
    this.progressBar = this.page.getByRole('progressbar', { name: 'Loading orders' });
    this.exportCSV = this.page.getByRole('link', { name: 'Export CSV' });
    this.rows = this.page.getByRole('row');
    this.cells = this.page.getByRole('cell');
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  filterRowsByText(text: string): Locator {
    return this.rows.filter({
      has: this.page.getByText(text),
    });
  }

}