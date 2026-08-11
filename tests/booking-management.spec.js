import { test, expect } from '@playwright/test';

// Credentials as constants at top
const USER_EMAIL    = 'rahulshetty1@gmail.com';
const USER_PASSWORD = 'Magiclife1!';

// -- Reusable helpers --------------------------------------------------------

async function login(page) {
  await page.goto('/login');
  await page.locator('#email').fill(USER_EMAIL);
  await page.locator('#password').fill(USER_PASSWORD);
  await page.locator('#login-btn').click();
  await expect(page.getByTestId('nav-bookings')).toBeVisible();
}

/**
 * Books the first non-sold-out event on the events page with quantity 1
 * and returns the resulting booking reference + event title so the test
 * can assert against them later without hardcoding fixture data.
 */
async function bookAnAvailableEvent(page) {
  await page.goto('/events');

  const eventCards = page.getByTestId('event-card');
  await expect(eventCards.first()).toBeVisible();

  const candidateCount = Math.min(await eventCards.count(), 5);
  let card;
  for (let i = 0; i < candidateCount; i++) {
    const candidate = eventCards.nth(i);
    const bookBtnText = (await candidate.getByTestId('book-now-btn').innerText()).trim();
    if (bookBtnText !== 'Sold Out') {
      card = candidate;
      break;
    }
  }
  if (!card) throw new Error('No bookable (non-sold-out) event found on the events page');

  const eventTitle = (await card.locator('h3').innerText()).trim();
  await card.getByTestId('book-now-btn').click();

  await expect(page.locator('#customerName')).toBeVisible();
  await page.locator('#customerName').fill('Test Automation');
  await page.locator('#customer-email').fill(`qa.${Date.now()}@example.com`);
  await page.locator('#phone').fill('9876543210');
  await page.locator('#confirm-booking').click();

  await expect(page.getByText('Booking Confirmed!')).toBeVisible();
  const bookingRef = (await page.locator('.booking-ref').innerText()).trim();

  return { eventTitle, bookingRef };
}

// -- Tests --------------------------------------------------------------------

test.describe('Booking Management', () => {

  // TC-001: View bookings list with existing bookings
  test('TC-001: bookings list shows booking reference, event, quantity, price and View Details link', async ({ page }) => {
    await login(page);
    const { eventTitle, bookingRef } = await bookAnAvailableEvent(page);

    // -- Navigate to the bookings list --
    await page.goto('/bookings');

    const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await expect(card).toBeVisible();

    // -- Assert the card surfaces booking ref, event name, quantity, and total price --
    await expect(card).toContainText(bookingRef);
    await expect(card).toContainText(eventTitle);
    await expect(card).toContainText('1 ticket');
    await expect(card).toContainText(/\$[\d,]+/);
    await expect(card.getByRole('link', { name: 'View Details' })).toBeVisible();
  });

  // TC-002: View single booking detail page
  test('TC-002: booking detail page shows event, customer, and payment sections', async ({ page }) => {
    await login(page);
    const { eventTitle, bookingRef } = await bookAnAvailableEvent(page);

    await page.goto('/bookings');
    const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await card.getByRole('link', { name: 'View Details' }).click();

    // -- Assert navigation to the detail page --
    await expect(page).toHaveURL(/\/bookings\/\d+/);

    // -- Assert breadcrumb + header show the booking reference and event title --
    await expect(page.locator('nav').getByText(bookingRef)).toBeVisible();
    await expect(page.locator('h1')).toContainText(eventTitle);

    // -- Assert all detail sections and their key fields render --
    await expect(page.getByText('Event Details')).toBeVisible();
    await expect(page.getByText('Customer Details')).toBeVisible();
    await expect(page.getByText('Payment Summary')).toBeVisible();
    await expect(page.getByText('Total Paid')).toBeVisible();
    await expect(page.getByText('Booking Information')).toBeVisible();
    await expect(page.getByTestId('check-refund-btn')).toBeVisible();
  });

  // TC-003: Cancel a single booking from the detail page
  test('TC-003: cancelling a booking from the detail page redirects and removes it from the list', async ({ page }) => {
    await login(page);
    const { bookingRef } = await bookAnAvailableEvent(page);

    await page.goto('/bookings');
    const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await card.getByRole('link', { name: 'View Details' }).click();
    await expect(page).toHaveURL(/\/bookings\/\d+/);

    // -- Trigger cancellation and confirm the dialog --
    await page.getByRole('button', { name: 'Cancel Booking' }).click();
    await expect(page.getByText('Cancel this booking?')).toBeVisible();
    await page.getByTestId('confirm-dialog-yes').click();

    // -- Assert success toast and redirect back to the bookings list --
    await expect(page.getByText('Booking cancelled successfully')).toBeVisible();
    await expect(page).toHaveURL(/\/bookings$/);

    // -- Assert the cancelled booking no longer appears in the list --
    await expect(page.getByTestId('booking-card').filter({ hasText: bookingRef })).toHaveCount(0);
  });

});
