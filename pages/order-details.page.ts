import type { Locator, Page } from '@playwright/test';

export class OrderDetailsPage {
  readonly duplicateButton: Locator;
  readonly cancelButton: Locator;
  readonly actionButtons: Locator;
  readonly flash: Locator;
  readonly toast: Locator;
  readonly loadingSpinner: Locator;

  constructor(private readonly page: Page) {
    this.duplicateButton = page.getByRole('button', { name: 'Duplicate order' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel order' });
    this.actionButtons = page.locator('#order-actions').getByRole('button');
    this.flash = page.getByTestId('flash');
    this.toast = page.getByTestId('toast');
    this.loadingSpinner = page.getByRole('progressbar', { name: 'Loading order', exact: true });
  }

  async open(orderId: string, query = ''): Promise<void> {
    await this.page.goto(`/orders/${orderId}${query}`);
    await this.page.waitForURL((url) => url.pathname === `/orders/${orderId}`);
  }

  /** Clicks Duplicate order and does not wait: the outcome may be a new page, a toast or a held request. */
  async clickDuplicate(): Promise<void> {
    await this.duplicateButton.click();
  }

  async activateDuplicateWithKeyboard(): Promise<void> {
    await this.duplicateButton.focus();
    await this.page.keyboard.press('Enter');
  }

  /** Clicks Duplicate order, waits for the copy's page and returns the copy's id. */
  async duplicate(): Promise<string> {
    await this.clickDuplicate();
    await this.page.waitForURL(/\/orders\/ORD-\d+\?duplicated=1$/);
    return this.idFromUrl();
  }

  idFromUrl(): string {
    const match = /\/orders\/(ORD-\d+)/.exec(this.page.url());
    if (match === null) {
      throw new Error(`Not on an order details page: ${this.page.url()}`);
    }
    return match[1];
  }
}
