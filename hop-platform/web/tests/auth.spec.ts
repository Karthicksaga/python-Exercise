import { test, expect } from '@playwright/test';

for (const captain of [false, true]) for (const theme of ['light', 'dark']) for (const width of [360, 1280]) {
  test(`auth ${captain ? 'captain' : 'rider'} ${theme} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => localStorage.setItem('hop.theme', theme), theme);
    let signedIn = false;
    let requests = 0;
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/config') return route.fulfill({ json: { areas: [], vehicles: [], phone_login: true } });
      if (path === '/api/me') return route.fulfill({ json: { user: signedIn ? { id: 'test', name: 'Test', role: captain ? 'captain' : 'rider' } : null, csrf: 'test' } });
      return route.fulfill({ json: {} });
    });
    await page.route('**/auth/otp/request', route => {
      requests++;
      expect(route.request().postDataJSON()).toEqual({ phone: '9876543210' });
      return route.fulfill({ json: { ok: true, expires_in: 600 } });
    });
    await page.route('**/auth/otp/verify', route => {
      const body = route.request().postDataJSON();
      expect(body.phone).toBe('9876543210');
      if (body.code !== '123456') return route.fulfill({ status: 400, json: { error: 'Incorrect code' } });
      signedIn = true;
      return route.fulfill({ json: { ok: true, csrf: 'test' } });
    });
    await page.goto(`http://127.0.0.1:${captain ? 5174 : 5173}`);
    const card = page.locator('.auth-card');
    await expect(card.getByRole('heading', { name: captain ? 'Sign in to drive' : 'Sign in to ride' })).toBeVisible();
    await expect(card.locator('.auth-otp input')).toHaveCount(0);
    const send = card.getByRole('button', { name: 'Send OTP', exact: true });
    await expect(send).toBeDisabled();
    const phone = card.getByLabel('Mobile number', { exact: true });
    await phone.fill('123');
    await expect(card.getByRole('alert')).toContainText('valid 10-digit');
    await phone.fill('9876543210');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(card.locator('.auth-otp input')).toHaveCount(6);
    await expect(phone).toHaveCount(0);
    await expect(card.getByText('+91 9876543210')).toBeVisible();
    await expect(card.getByText(/Resend OTP in/)).toBeVisible();
    await page.clock.install();
    await page.clock.fastForward(31000);
    await card.getByRole('button', { name: 'Resend OTP', exact: true }).click();
    expect(requests).toBe(2);
    const first = card.getByRole('textbox', { name: 'Digit 1', exact: true });
    await first.fill('111111');
    await expect(card.getByRole('textbox', { name: 'Digit 6', exact: true })).toBeFocused();
    await card.getByRole('button', { name: 'Verify and Sign In' }).click();
    await expect(card.getByRole('alert')).toHaveText('Incorrect code');
    await card.getByRole('button', { name: 'Change Mobile Number' }).click();
    await expect(phone).toBeVisible();
    await expect(phone).toBeFocused();
    await expect(card.locator('.auth-otp input')).toHaveCount(0);
    await expect(card.getByRole('button', { name: /Send OTP in/ })).toBeDisabled();
    await page.clock.fastForward(31000);
    await send.click();
    await first.evaluate(el => {
      const data = new DataTransfer(); data.setData('text', '123456');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    });
    await expect(card.getByRole('textbox', { name: 'Digit 6', exact: true })).toHaveValue('6');
    await page.keyboard.press('Backspace');
    await expect(card.getByRole('textbox', { name: 'Digit 6', exact: true })).toHaveValue('');
    await page.keyboard.type('6');
    const bounds = await card.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(420);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await card.getByRole('button', { name: 'Verify and Sign In' }).click();
    await expect(card).toBeHidden();
    expect(signedIn).toBe(true);
  });
}
