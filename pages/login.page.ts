import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;

  constructor(public readonly page: Page) {
    this.usernameInput = page.getByLabel('username');
    this.passwordInput = page.getByLabel('password');
    this.signInButton = page.getByRole('button', { name: 'Sign in'});
  }

  async login(user: string, pass: string) {
    await this.usernameInput.fill(user);
    await this.passwordInput.fill(pass);
    await this.signInButton.click();
    await this.page.waitForURL('/orders');
  }
}
