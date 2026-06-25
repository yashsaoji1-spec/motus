import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SCREENS, VIEWPORTS, loginAs, gotoScreen } from './harness';

for (const screen of SCREENS) {
  test(`a11y: ${screen.id}`, async ({ page }) => {
    await loginAs(page, screen.persona);
    await gotoScreen(page, screen.id);
    const allViolations: string[] = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .include(`#${screen.id}`)
        .analyze();
      for (const v of results.violations) allViolations.push(`${screen.id} @ ${vp.name}: ${v.id}`);
    }
    expect(allViolations, allViolations.join('\n')).toEqual([]);
  });
}
