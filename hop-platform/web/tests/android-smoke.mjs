// Run after installing the debug APK and starting an emulator-local fixture API.
import { _android } from 'playwright';
import { mkdir } from 'node:fs/promises';
const devices = await _android.devices();
if (!devices.length) throw new Error('Start an Android emulator or attach a device');
const device = devices[0];
const app = process.argv[2] || 'rider';
if (!['rider', 'captain'].includes(app)) throw new Error('Use rider or captain');
const pkg = `com.hop.${app}`;
await device.shell(`am start -n ${pkg}/.MainActivity`);
const webview = await device.webView({ pkg }, { timeout: 30000 });
const page = await webview.page();
page.setDefaultTimeout(20000);
await page.locator('.page-title').waitFor({ timeout: 30000 });
await mkdir('test-results-android', { recursive: true });
for (const theme of ['light', 'dark']) {
  if (await page.locator('html').getAttribute('data-theme') !== theme) {
    await page.locator('.theme-toggle').click();
  }
  await page.locator('.page-title').waitFor();
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
  await page.getByRole('button', { name: 'Open app menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'About you', exact: true }).waitFor();
  const layout = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, theme: document.documentElement.dataset.theme, mantine: document.documentElement.dataset.mantineColorScheme }));
  if (layout.document > layout.width + 1 || layout.theme !== theme || layout.mantine !== theme) throw new Error(JSON.stringify(layout));
  await page.screenshot({ path: `test-results-android/${app}-${theme}-profile.png`, fullPage: true });
  await device.screenshot({ path: `test-results-android/${app}-${theme}-device.png` });
  console.log(JSON.stringify({ app, model: device.model(), theme, ...layout }));
}
await device.close();
