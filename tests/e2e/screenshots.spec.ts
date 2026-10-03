import { expect, test } from "@playwright/test";
import { screens, signIn } from "./screens";

/*
 * `pnpm screenshots`: every screen at the three widths of section 10, for
 * the design reviews of Analyst 1. Written to .local/screenshots/.
 */
const sizes = [
  { name: "360", viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 },
  { name: "1280", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  // The projector: 1280 x 720 with the browser zoomed to 125 %.
  { name: "projektor", viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1.25 },
];

const OUT = ".local/screenshots";

for (const size of sizes) {
  test.describe(size.name, () => {
    test.use({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor });

    for (const screen of screens) {
      test(screen.name, async ({ page, baseURL }) => {
        if (screen.console) await signIn(page, baseURL);
        await page.goto(screen.path);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `${OUT}/${screen.name}-${size.name}.png`, fullPage: true });
      });
    }

    test("s1-czekanie", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Samotni seniorzy na wsi" }).click();
      await page.getByRole("button", { name: "Znajdź drogę" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Szukamy drogi" })).toBeVisible();
      await page.screenshot({ path: `${OUT}/s1-czekanie-${size.name}.png`, fullPage: true });
    });

    test("s7-moderacja-blad", async ({ page, baseURL }) => {
      await signIn(page, baseURL);
      await page.goto("/rops");
      await page.getByRole("button", { name: "Odrzuć" }).first().click();
      await expect(page.getByText("Wybierz powód odrzucenia.")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${OUT}/s7-moderacja-blad-${size.name}.png`, fullPage: true });
    });
  });
}

test.describe("kontrast", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const screen of screens.filter((item) => ["s1-start", "s2-droga", "s10-pomoc"].includes(item.name))) {
    test(screen.name, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("view:contrast", "on"));
      await page.goto(screen.path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${OUT}/${screen.name}-1280-kontrast.png`, fullPage: true });
    });
  }
});
