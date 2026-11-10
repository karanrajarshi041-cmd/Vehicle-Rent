import { test, expect } from '@playwright/test';

function daysBetween(start, end) {
  return (Date.parse(end.slice(0, 10) + 'T00:00:00Z') - Date.parse(start.slice(0, 10) + 'T00:00:00Z')) / 86400000;
}

test('long trip mode carries bike dates through search, login and booking', async ({ page }) => {
  await page.goto('/');
  const modes = page.getByRole('group', { name: 'Trip mode' });
  await modes.getByRole('button', { name: /Long trip/ }).click();
  const presets = page.getByRole('group', { name: 'Choose trip length' });
  await presets.getByRole('button', { name: '14 days' }).click();
  await expect(presets.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Vehicle type').selectOption('bike');
  await page.getByRole('button', { name: 'Search vehicles' }).click();

  await expect(page).toHaveURL(/trip=long/);
  let query = new URL(page.url()).searchParams;
  expect(query.get('category')).toBe('bike');
  expect(daysBetween(query.get('pickup_at'), query.get('return_at'))).toBe(14);
  await expect(page.getByRole('heading', { name: /Available for your trip/ })).toBeVisible();
  await expect(page.locator('.listing-grid .vehicle-card').filter({ hasText: 'Himalayan 450' })).toBeVisible();

  const planner = page.getByRole('region', { name: 'Long trip planner' });
  await planner.getByRole('button', { name: '30 days' }).click();
  await planner.getByRole('button', { name: 'Check availability' }).click();
  await expect.poll(() => daysBetween(new URL(page.url()).searchParams.get('pickup_at'), new URL(page.url()).searchParams.get('return_at'))).toBe(30);
  query = new URL(page.url()).searchParams;
  const pickup = query.get('pickup_at'), ret = query.get('return_at');
  await page.locator('.listing-grid .vehicle-card').filter({ hasText: 'Himalayan 450' }).getByRole('link', { name: 'Royal Enfield Himalayan 450', exact: true }).click();
  await expect(page).toHaveURL(/\/vehicles\/\d+\?/);
  await expect(page.locator('.booking-panel input[type=datetime-local]').nth(0)).toHaveValue(pickup);
  await expect(page.locator('.booking-panel input[type=datetime-local]').nth(1)).toHaveValue(ret);
  await expect(page.locator('.booking-panel').getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Continue to book' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue to book' }).click();

  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole('button', { name: 'Customer demo' }).click();
  await expect(page).toHaveURL(/\/book\/\d+\?.*trip=long/);
  await expect(page.getByText('Long trip mode', { exact: true })).toBeVisible();
  await expect(page.getByText('Vehicle rental (30 days)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to payment' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page.getByText('Demo payments only')).toBeVisible();
  await page.getByRole('button', { name: /Pay ₹/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re going places.' })).toBeVisible();
  const ref = await page.locator('.confirmation-card > p strong').innerText();
  await page.getByRole('link', { name: 'View my bookings' }).click();
  const card = page.locator('.booking-card').filter({ hasText: ref });
  await expect(card).toContainText('30 days');
  page.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('link', { name: 'Booking history' }).click();
  await expect(page.locator('.booking-card').filter({ hasText: ref }).getByText('Cancelled')).toBeVisible();
});

test('long trip planner works on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('group', { name: 'Trip mode' }).getByRole('button', { name: /Long trip/ }).click();
  await expect(page.getByRole('group', { name: 'Choose trip length' })).toBeVisible();
  await page.getByLabel('Vehicle type').selectOption('cars');
  await page.getByRole('button', { name: 'Search vehicles' }).click();
  await expect(page.getByRole('region', { name: 'Long trip planner' })).toBeVisible();
  await expect(page.locator('.listing-grid .vehicle-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('long trip shortcuts keep the pickup time across month boundaries', async ({ page }) => {
  const dates = await page.evaluate(() => {
    const format = d => {
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T11:30`;
    };
    const start = new Date();
    start.setDate(1);
    start.setMonth(start.getMonth()+2);
    start.setDate(0); // Last day of next month.
    const end = new Date(start); end.setDate(end.getDate()+14);
    const thirty = new Date(start); thirty.setDate(thirty.getDate()+30);
    const movedStart = new Date(start); movedStart.setDate(movedStart.getDate()+2);
    const movedEnd = new Date(movedStart); movedEnd.setDate(movedEnd.getDate()+30);
    return [start, end, thirty, movedStart, movedEnd].map(format);
  });
  const bikes = await (await page.request.get('/api/vehicles?category=bike')).json();
  const bike = bikes.find(vehicle => vehicle.model === 'Himalayan 450');
  expect(bike).toBeTruthy();
  const query = new URLSearchParams({trip:'long', pickup_at:dates[0], return_at:dates[1]});
  await page.goto(`/vehicles/${bike.id}?${query}`);
  const panel = page.locator('.booking-panel');
  await panel.getByRole('button', { name: '30 days' }).click();
  await expect(panel.locator('input[type=datetime-local]').nth(1)).toHaveValue(dates[2]);
  await panel.locator('input[type=datetime-local]').nth(0).fill(dates[3]);
  await expect(panel.locator('input[type=datetime-local]').nth(1)).toHaveValue(dates[4]);
  await expect(panel.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Continue to book' })).toBeEnabled();
});
