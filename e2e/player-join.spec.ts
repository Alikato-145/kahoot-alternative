import { expect, test } from '@playwright/test'

// The browser suite supplies a live Task 4 Socket.IO server and session PIN.
// Keeping these external lets it exercise the real reconnect protocol rather
// than a browser-only socket mock.
test.describe('live player join flow', () => {
  test.skip(!process.env.E2E_GAME_URL || !process.env.E2E_GAME_PIN, 'requires the live game test socket')

test('a player joins the lobby and waits after choosing an answer', async ({ page }) => {
  await page.goto(`${process.env.E2E_GAME_URL}/join`)
  await page.getByLabel('Game PIN').fill(process.env.E2E_GAME_PIN!)
  await page.getByLabel('ชื่อเล่น').fill('มานัส')
  await page.getByRole('button', { name: 'เข้าร่วม' }).click()
  await expect(page).toHaveURL(new RegExp(`/game/${process.env.E2E_GAME_PIN}$`))
  await expect(page.getByRole('status', { name: /รอผู้จัดเริ่มเกม/ })).toBeVisible()

  // The live test socket starts the question; the player must remain on this
  // route after choosing the triangle and see the local wait state.
  await page.getByRole('button', { name: 'สามเหลี่ยม' }).click()
  await expect(page.getByRole('status', { name: /ส่งคำตอบแล้ว/ })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/game/${process.env.E2E_GAME_PIN}$`))
})
})
