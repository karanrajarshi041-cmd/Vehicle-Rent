import { test, expect } from '@playwright/test';

function pageDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T10:00`;
}

test('customer can add a driver and the server-priced charge appears in checkout', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Customer demo' }).click();
  await page.goto('/vehicles/4');
  const dates = [pageDate(70), pageDate(72)];
  await page.locator('.booking-panel input[type=datetime-local]').nth(0).fill(dates[0]);
  await page.locator('.booking-panel input[type=datetime-local]').nth(1).fill(dates[1]);
  await page.getByLabel(/Add a professional driver/).check();
  await expect(page.locator('.booking-panel')).toContainText('Driver');
  await expect(page.getByRole('button', { name: 'Continue to book' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue to book' }).click();
  await expect(page.getByRole('radio', { name: /With a driver/ })).toBeChecked();
  await expect(page.locator('.price-breakdown')).toContainText('Driver (₹800 × 2 days)');
  await expect(page.getByText('Licence verification is required for self-drive')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page.locator('.price-breakdown')).toContainText('Driver (₹800 × 2 days)');
  await page.getByRole('button', { name: /Pay ₹/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re going places.' })).toBeVisible();
  const reference = await page.locator('.confirmation-card > p strong').innerText();
  await page.getByRole('link', { name: 'View my bookings' }).click();
  const card = page.locator('.booking-card').filter({ hasText: reference });
  await expect(card).toContainText('With driver');
  page.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Cancel' }).click();
});

test('new customer submits KYC and an administrator approves it', async ({ page }) => {
  const email = `kyc-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('KYC Browser Tester');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Phone number (optional)').fill('9876543210');
  await page.getByLabel('Password', { exact: true }).fill('Secure123!');
  await page.getByLabel('Confirm password').fill('Secure123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto('/book/4');
  await expect(page.getByText('Licence verification is required for self-drive')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to payment' })).toBeDisabled();
  await page.goto('/account/profile');
  await page.getByLabel('Driving licence number').fill('WB0120260012345');
  await page.getByLabel('Licence expiry date').fill(pageDate(500).slice(0, 10));
  await page.locator('.kyc-file-input input').setInputFiles({
    name: 'licence.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(page.locator('.kyc-card')).toContainText('Pending');
  await page.locator('.account-logout').click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/login');
  await page.getByRole('button', { name: 'Admin demo' }).click();
  await page.getByRole('link', { name: 'Customers & KYC', exact: true }).click();
  const row = page.locator('tbody tr').filter({ hasText: email });
  await row.getByRole('button', { name: 'Review KYC' }).click();
  await expect(page.getByRole('heading', { name: 'Review driving licence' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve licence' }).click();
  await expect(row).toContainText('Verified');
  await page.locator('.admin-side-bottom').getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Secure123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.goto('/account/profile');
  await expect(page.locator('.kyc-card')).toContainText('Verified');
  await page.goto('/book/4');
  await expect(page.getByRole('button', { name: 'Continue to payment' })).toBeEnabled();
});
