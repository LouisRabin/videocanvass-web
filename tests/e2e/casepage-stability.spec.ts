import { expect, test, type Locator, type Page } from '@playwright/test'

async function enterFirstCase(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Enter app' }).click()
  await page.getByRole('button', { name: 'Open' }).first().click()
}

function mapToolsToggle(page: Page): Locator {
  return page.getByRole('button', { name: /Open map tools|Close map tools/i }).first()
}

test.describe('CasePage stability checks', () => {
  test('web map dock exists and section toggles remain functional', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await enterFirstCase(page)

    const menuToggle = mapToolsToggle(page)
    await expect(menuToggle).toBeVisible()
    await menuToggle.click()

    await page.getByRole('button', { name: 'Views' }).click()
    await expect(page.getByRole('button', { name: 'Map view' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Filters' }).click()
    await expect(page.getByText(/Result \(\d+ total\)/).first()).toBeVisible()

    await page.getByRole('button', { name: 'Tracks' }).click()
    await expect(page.getByRole('button', { name: 'New Track' })).toBeVisible()

    await page.getByRole('button', { name: 'Photos' }).click()
    await expect(page.getByRole('button', { name: 'Add photo' }).last()).toBeVisible()
  })

  test('toolbar/search layout remains usable across three viewport heights', async ({ page }) => {
    await enterFirstCase(page)
    const heights = [700, 900, 1100]
    for (const h of heights) {
      await page.setViewportSize({ width: 1280, height: h })
      const openToggle = page.getByRole('button', { name: 'Open map tools: views, filters, tracks, and photos' }).first()
      const closeToggle = page.getByRole('button', { name: 'Close map tools' }).first()
      if (await closeToggle.isVisible()) {
        await closeToggle.click()
      }
      await openToggle.click()
      await page.getByRole('button', { name: 'Views' }).click()
      await expect(page.getByRole('button', { name: 'Map view' }).first()).toBeVisible()
      await expect.poll(async () => {
        return page.evaluate(() => {
          const overflows = Array.from(document.querySelectorAll('input, textarea')).some((el) => {
            const e = el as HTMLElement
            return e.scrollWidth - e.clientWidth > 1
          })
          return overflows
        })
      }).toBe(false)
    }
  })

test('mobile dock open/close remains stable with grace timing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await enterFirstCase(page)

    const openToggle = page.getByRole('button', { name: 'Open map tools: views, filters, tracks, and photos' }).first()
    await openToggle.click()

    const closeToggle = page.getByRole('button', { name: 'Close map tools' }).first()
    await expect(closeToggle).toBeVisible()
    await page.waitForTimeout(100)
    await expect(closeToggle).toBeVisible()

    await closeToggle.click()
    await expect(openToggle).toBeVisible()
  })

  test('DVR calculator entry points remain available', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await enterFirstCase(page)

    const menuToggle = mapToolsToggle(page)
    await menuToggle.click()
    await page.getByRole('button', { name: 'DVR calculator' }).first().click()
    await expect(page.getByText('DVR time calculator').first()).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
