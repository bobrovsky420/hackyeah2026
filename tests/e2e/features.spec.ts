import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./screens";

/*
 * The MUST requirements of section 7 around the journeys: the gate's
 * redaction and crisis banner, the quick exit, the clarification, the rate
 * limit, the path selection, the recompute, the content report, the MIIS
 * attribution, the accessibility statement, the register card and the map
 * table.
 */

const problem = (page: Page) => page.getByLabel("Co się dzieje i kogo dotyczy?");

/** The quick exit leaves to an outside page; the test serves a blank one instead. */
async function neutralPage(page: Page) {
  await page.route("https://www.google.pl/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Strona neutralna</title>" }),
  );
}

test("FR-2.5: personal data is removed before the route is stored, and the reader is told", async ({ page }) => {
  await page.goto("/");
  await problem(page).fill(
    "Samotni seniorzy w naszej gminie potrzebują klubu. Mój PESEL 44051401359, telefon 600 123 456, adres ul. Kwiatowa 5.",
  );
  await page.getByRole("button", { name: "Znajdź drogę" }).click();
  await expect(page.getByText("Usunęliśmy dane osobowe (3 fragmenty)")).toBeVisible({ timeout: 20_000 });

  // The stored text is what the needs form is prefilled with.
  const id = new URL(page.url()).pathname.split("/").pop();
  await page.goto(`/zapisz-potrzebe?droga=${id}`);
  const text = page.getByRole("textbox", { name: "Opis potrzeby" });
  await expect(text).toHaveValue(/\[usunięto\]/);
  await expect(text).not.toHaveValue(/44051401359|600 123 456|Kwiatowa 5/);
});

test("S02 (13.1): a community need about violence keeps its route, with the crisis banner and the quick exit", async ({
  page,
}) => {
  await neutralPage(page);
  await page.goto("/");
  await problem(page).fill(
    "Pracuję w ośrodku pomocy społecznej. W gminie przybywa przemocy domowej, a zespół interdyscyplinarny nie nadąża.",
  );
  await page.getByRole("button", { name: "Znajdź drogę" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Przemoc domowa w gminie wiejskiej/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Jeśli ktoś potrzebuje pomocy teraz, zadzwoń:")).toBeVisible();
  await expect(page.getByRole("link", { name: "800 120 002" })).toHaveAttribute("href", "tel:800120002");
  await expect(page.getByRole("link", { name: "Wyjdź" })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForURL("https://www.google.pl/");
});

test("FR-12.5: S10 leaves at once by the Wyjdź button", async ({ page }) => {
  await neutralPage(page);
  await page.goto("/droga/pomoc-czlowieka");
  await page.getByRole("link", { name: "Wyjdź" }).click();
  await page.waitForURL("https://www.google.pl/");
});

test("FR-2.3: one question when neither a group nor a place is known, and the answer reruns the route", async ({ page }) => {
  await page.goto("/droga/przyklad-doprecyzowanie");
  const question = page.getByRole("group", { name: "Kogo najbardziej dotyczy ten problem?" });
  await expect(question).toBeVisible();
  await page.getByRole("button", { name: "Szukaj ponownie" }).click();
  await expect(page.getByText("Wybierz jedną odpowiedź.")).toBeVisible();

  await question.getByRole("radio", { name: "Seniorzy" }).check();
  await page.getByRole("button", { name: "Szukaj ponownie" }).click();
  await expect(page).toHaveURL(/\/droga\/rt-/, { timeout: 30_000 });
  await expect(page.getByRole("group", { name: "Kogo najbardziej dotyczy ten problem?" })).toHaveCount(0);
});

test("FR-2.4: a refused request says so and keeps the text", async ({ page }) => {
  await page.route("**/api/routes", (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: '{"error":"rate_limited"}' }),
  );
  await page.goto("/");
  await problem(page).fill("Samotni seniorzy w naszej gminie nie mają gdzie się spotkać.");
  await page.getByRole("button", { name: "Znajdź drogę" }).click();
  await expect(page.getByText("Za dużo zapytań. Spróbuj za minutę.")).toBeVisible();
  await expect(problem(page)).toHaveValue(/Samotni seniorzy/);
});

test("FR-8.2: the applicant type re-selects the paths on the route", async ({ page }) => {
  await page.goto("/droga/przyklad-seniorzy");
  const block = page.getByRole("region", { name: "Ścieżka wdrożenia" });
  await expect(block.getByRole("heading", { level: 3, name: /Aktywni Seniorzy/ })).toBeVisible();
  await block.getByLabel("Kto złoży wniosek?").selectOption("ngo");
  await block.getByRole("button", { name: "Pokaż ścieżki" }).click();
  await expect(block.getByRole("heading", { level: 3, name: /Aktywni Seniorzy/ })).toHaveCount(0);
  await expect(block.getByRole("heading", { level: 3, name: /Mały grant/ })).toBeVisible();
});

test("FR-3.5: Policz ponownie runs the route again", async ({ page }) => {
  await page.goto("/droga/przyklad-seniorzy");
  await page.getByRole("button", { name: "Policz ponownie" }).click();
  await expect(page.getByText("Liczymy drogę od nowa.", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/droga\/rt-/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: /Samotni seniorzy/ })).toBeVisible();
});

test("FR-12.9: a content report reaches the moderation queue and is decided there", async ({ page, baseURL }) => {
  const comment = `Zgłoszenie testowe ${Date.now()}`;
  await page.goto("/droga/przyklad-seniorzy");
  await page.getByRole("link", { name: "Zgłoś problem z tą treścią" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zgłoś problem z tą treścią" })).toBeVisible();
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(page.getByRole("group", { name: "Sprawdź formularz" })).toBeFocused();
  await page.getByRole("radio", { name: "Nieprawdziwe informacje" }).check();
  await page.getByLabel(/Opisz krótko problem/).fill(comment);
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();
  await expect(page.getByText("Dziękujemy. Zgłoszenie trafiło do ROPS.")).toBeVisible();

  await signIn(page, baseURL);
  await page.goto("/rops");
  const queue = page.getByRole("region", { name: /^Zgłoszenia treści: \d+$/ });
  const row = queue.getByRole("row").filter({ hasText: comment });
  await expect(row).toContainText("Nieprawdziwe informacje");
  await row.getByRole("button", { name: "Uwzględnij" }).click();
  await expect(queue.getByRole("status")).toHaveText("Uwzględniono zgłoszenie treści.");
});

test("FR-1.8: a MIIS item is shown like every ROPS item, its terms named in the attribution", async ({ page }) => {
  await page.goto("/innowacja/inn-rops-senior-cuder");
  await expect(page.getByRole("heading", { level: 1, name: "Senior CUDER" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Najważniejsze informacje" })).toBeVisible();
  await expect(page.getByRole("link", { name: "zasady wykorzystania innowacji MIIS" })).toHaveAttribute(
    "href",
    /Zasady_wykorzystania_innowacji_MIIS\.pdf$/,
  );
});

test("FR-11.4: the accessibility statement carries the identifiers of the gov.pl template", async ({ page }) => {
  await page.goto("/dostepnosc");
  const ids = [
    "a11y-deklaracja",
    "a11y-wstep",
    "a11y-podmiot",
    "a11y-url",
    "a11y-data-publikacja",
    "a11y-data-aktualizacja",
    "a11y-status",
    "a11y-data-sporzadzenie",
    "a11y-kontakt",
    "a11y-osoba",
    "a11y-email",
    "a11y-telefon",
    "a11y-procedura",
    "a11y-architektura",
    "a11y-aplikacje",
  ];
  for (const id of ids) await expect(page.locator(`#${id}`)).toHaveCount(1);
  await expect(page.locator("h1#a11y-deklaracja")).toHaveText("Deklaracja dostępności");
  for (const id of ["a11y-data-publikacja", "a11y-data-aktualizacja", "a11y-data-sporzadzenie"]) {
    await expect(page.locator(`#${id}`)).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  }
});

test("FR-11.7: Jak to działa has the register card in its order", async ({ page }) => {
  await page.goto("/jak-to-dziala");
  await expect(page.getByRole("region", { name: "Karta systemu" }).locator("dt")).toHaveText([
    "Cel",
    "Kto prowadzi i kontakt",
    "Podstawa prawna przetwarzania danych",
    "Co system robi, a czego nie",
    "Jak działa, w trzech zdaniach",
    "Dane i czas przechowywania",
    "Gdzie decyduje człowiek",
    "Znane ograniczenia i równe traktowanie",
    "Ostatnia ocena",
  ]);
});

test("FR-7.5: the map's table lists all 183 gminas and sorts by value", async ({ page }) => {
  await page.goto("/mapa?widok=tabela");
  const table = page.getByRole("table", { name: /^Gminy Małopolski:/ });
  await expect(table.locator("tbody tr")).toHaveCount(183);
  await table.getByRole("link", { name: /^Wartość/ }).click();
  await expect(page).toHaveURL(/sort=wartosc/);
  await expect(table.getByRole("columnheader", { name: /^Wartość/ })).toHaveAttribute("aria-sort", "descending");
  await expect(table.locator("tbody tr").first()).toContainText("1 074");
});
