import { expect, test, type Page } from '@playwright/test'

async function enterFirstCase(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Enter app' }).click()
  await page.getByRole('button', { name: 'Open' }).first().click()
}

async function openViewTools(page: Page) {
  const closeMobileTools = page.getByRole('button', { name: 'Close map tools' }).first()
  if (!(await closeMobileTools.isVisible().catch(() => false))) {
    const openMobileTools = page.getByRole('button', { name: 'Open map tools: views, filters, tracks, and photos' }).first()
    if (await openMobileTools.isVisible().catch(() => false)) {
      await openMobileTools.click()
    }
  }
  await page.getByRole('button', { name: 'Views' }).first().click()
}

async function isMobileDockMode(page: Page) {
  return page
    .getByRole('button', { name: 'Open map tools: views, filters, tracks, and photos' })
    .first()
    .isVisible()
    .catch(() => false)
}

test.describe('CasePage stability checks', () => {
  test('web map dock exists and section toggles remain functional', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await enterFirstCase(page)

    await openViewTools(page)
    await expect(page.getByRole('button', { name: 'Map view' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Filters' }).first().click()
    await expect(page.getByText(/Result \(\d+ total\)/).first()).toBeVisible()

    await page.getByRole('button', { name: 'Tracks', exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'New Track' })).toBeVisible()

    await page.getByRole('button', { name: 'Photos' }).first().click()
    await expect(page.getByRole('button', { name: 'Add photo' }).last()).toBeVisible()
  })

  test('toolbar/search layout remains usable across three viewport heights', async ({ page }) => {
    await enterFirstCase(page)
    const heights = [700, 900, 1100]
    for (const h of heights) {
      await page.setViewportSize({ width: 1280, height: h })
      await openViewTools(page)
      await page.getByRole('button', { name: 'Filters' }).first().click()
      await openViewTools(page)
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

    // Toggle within the dock should remain clickable and not be swallowed by outside-dismiss.
    await page.getByRole('button', { name: 'Views' }).first().click()
    await expect(page.getByRole('button', { name: 'Map view' }).first()).toBeVisible()

    await closeToggle.click()
    await expect(openToggle).toBeVisible()
  })

  test('web map chrome layering remains clickable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await enterFirstCase(page)
    test.skip(await isMobileDockMode(page), 'Full-web map tools use the floating rail, not the mobile dock.')

    // Layering contract: map detail overlay sits above map content and remains interactive.
    await openViewTools(page)
    await page.getByRole('button', { name: 'List view' }).first().click()
    await page.getByRole('button', { name: 'Back to map' }).click()
    const expandNotes = page.getByRole('button', { name: 'Expand notes and details' }).first()
    if (await expandNotes.isVisible().catch(() => false)) {
      await expandNotes.click()
      await expect(page.getByRole('button', { name: 'Collapse notes and details' }).first()).toBeVisible()
    }
  })

  test('tab and view transitions preserve expected drawer behavior', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await enterFirstCase(page)

    await openViewTools(page)
    await page.getByRole('button', { name: 'List view' }).first().click()
    await expect(page.getByRole('button', { name: 'Back to map' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to map' }).click()
    await openViewTools(page)
    await expect(page.getByRole('button', { name: 'Map view' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Subject tracking' }).first().click()
    await page.getByRole('button', { name: 'Video canvassing' }).first().click()
    await expect(page.getByRole('button', { name: 'Case List' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Video canvassing' }).first()).toBeVisible()
  })

  test('DVR calculator entry points remain available', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await enterFirstCase(page)
    await openViewTools(page)

    await page.getByRole('button', { name: 'DVR calculator' }).first().click()
    await expect(page.getByText('DVR time calculator').first()).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
