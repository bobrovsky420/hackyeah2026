import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { screens, signIn, themes } from "./screens";

/*
 * Specification 12.2: axe on every screen with zero critical or serious
 * findings, in each of the three themes, plus the team's own bar of 7:1
 * for text (WCAG 1.4.6, the rule color-contrast-enhanced).
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Violations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

function report(violations: Violations): string {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("\n    ")}`)
    .join("\n");
}

async function expectAccessible(page: Page) {
  const wcag = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = wcag.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking, report(blocking)).toEqual([]);
  const enhanced = await new AxeBuilder({ page }).withRules(["color-contrast-enhanced"]).analyze();
  expect(enhanced.violations, report(enhanced.violations)).toEqual([]);
}

for (const [theme, applyTheme] of Object.entries(themes)) {
  test.describe(theme, () => {
    for (const screen of screens) {
      test(screen.name, async ({ page, baseURL }) => {
        await applyTheme(page);
        if (screen.console) await signIn(page, baseURL);
        await page.goto(screen.path);
        await expectAccessible(page);
      });
    }

    test("s1 with the error summary", async ({ page }) => {
      await applyTheme(page);
      await page.goto("/");
      await page.getByRole("button", { name: "Znajdź drogę" }).click();
      await expect(page.getByRole("heading", { name: "Sprawdź formularz" })).toBeVisible();
      await expectAccessible(page);
    });

    test("s1 with the gmina list open", async ({ page }) => {
      await applyTheme(page);
      await page.goto("/");
      await page.getByRole("combobox", { name: "Gmina" }).fill("nowy");
      await expect(page.getByRole("listbox")).toBeVisible();
      await expectAccessible(page);
    });

    test("s7 with a rejection refused for lack of a reason", async ({ page, baseURL }) => {
      await applyTheme(page);
      await signIn(page, baseURL);
      await page.goto("/rops");
      await page.getByRole("button", { name: "Odrzuć" }).first().click();
      await expect(page.getByText("Wybierz powód odrzucenia.")).toBeVisible();
      await expectAccessible(page);
    });
  });
}
