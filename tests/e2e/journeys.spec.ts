import { expect, test } from "@playwright/test";
import { CONSOLE_TOKEN } from "./screens";

/*
 * Journeys of section 6 on the mock data (specification 13): J1 route, J2
 * no proven solution to the needs bank, J10 a person in crisis, plus the
 * acceptance checks of the place picker (FR-2.2) and the view settings.
 */

const problem = (page: import("@playwright/test").Page) => page.getByLabel("Co się dzieje i kogo dotyczy?");

test("J1: the seniors example leads to a route with three solutions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Samotni seniorzy na wsi" }).click();
  await expect(problem(page)).toHaveValue(/samotnych seniorów/);
  await expect(page.getByRole("combobox", { name: "Gmina" })).toHaveValue("Laskowa, powiat limanowski");
  await expect(page.getByRole("radio", { name: "Pracuję w instytucji" })).toBeChecked();

  await page.getByRole("button", { name: "Znajdź drogę" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Szukamy drogi" })).toBeFocused();

  const heading = page.getByRole("heading", { level: 1, name: /Samotni seniorzy/ });
  await expect(heading).toBeFocused({ timeout: 20_000 });
  await expect(page.getByText("Laskowa, powiat limanowski")).toBeVisible();
  await expect(page.getByRole("region", { name: "Rozwiązania" }).getByRole("article")).toHaveCount(3);
  await expect(page.getByText(/Dopasowanie i uzasadnienia wygenerowano automatycznie/)).toBeVisible();
  await expect(page.getByText(/^Prototyp z hackathonu HackYeah 2026/).first()).toBeVisible();

  await page.getByRole("link", { name: "Zobacz szczegóły" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Kapsuła czasu - recepta na samotność" })).toBeVisible();
  await page.getByRole("link", { name: "Wróć do drogi" }).click();
  await expect(heading).toBeVisible();

  await page.getByRole("button", { name: "Tak", exact: true }).click();
  await expect(page.getByText(/Dziękujemy\. Twoja ocena/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Pobierz jako plik tekstowy" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^droga-.+\.md$/);

  await page.getByRole("link", { name: "Zmień opis" }).click();
  await expect(problem(page)).toHaveValue(/samotnych seniorów/);
});

test("J2: a need without a proven solution goes to the needs bank", async ({ page }) => {
  await page.goto("/");
  await problem(page).fill("Brakuje transportu do przychodni dla osób z naszej wsi.");
  await page.getByRole("button", { name: "Znajdź drogę" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Nie znaleźliśmy sprawdzonego rozwiązania dla tej potrzeby." }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("link", { name: "Zapisz potrzebę w banku potrzeb", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Opis potrzeby" })).toHaveValue(/transportu do przychodni/);
  await page.getByRole("button", { name: "Zapisz potrzebę" }).click();
  await expect(page.getByRole("group", { name: "Sprawdź formularz" })).toBeFocused();

  await page.getByRole("checkbox", { name: /przechowywał opis potrzeby/ }).check();
  await page.getByRole("button", { name: "Zapisz potrzebę" }).click();
  await expect(page.getByText("Zapisaliśmy potrzebę w banku potrzeb")).toBeVisible();

  // S6 (FR-5.5): the brief, its sections in the order of the incubator's application form.
  await page.getByRole("link", { name: "Przygotuj fiszkę dla inkubatora" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Brakuje transportu do przychodni dla osób z naszej wsi" })).toBeFocused();
  await expect(page.locator("article h2")).toHaveText([
    "Problem",
    "Kogo dotyczy i skala",
    "Co już istnieje",
    "Luka",
    "Kierunek rozwiązania (hipoteza)",
    "Potencjalni partnerzy",
    "Możliwe ścieżki",
    "Źródła",
  ]);
  await expect(page.getByText("Czy podobne rozwiązania są stosowane w Polsce albo na świecie?")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Pobierz jako plik tekstowy" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^fiszka-nd-.+\.md$/);
});

test("J4: an innovation leads to the gminas where it is most needed", async ({ page }) => {
  await page.goto("/innowacja/inn-nat-649");
  await page.getByRole("link", { name: "Gdzie jest najbardziej potrzebna" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Gdzie „Kapsuła czasu - recepta na samotność” jest najbardziej potrzebna" }),
  ).toBeVisible();
  await expect(page.getByText("Wskaźnik potrzeby: Osoby w wieku 65 lat i więcej.")).toBeVisible();
  const proposals = page.getByRole("link", { name: /^Zaproponuj gminie / });
  await expect(proposals).toHaveCount(10);
  const gmina = ((await proposals.first().textContent()) ?? "").replace("Zaproponuj gminie ", "");
  await proposals.first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Poproś o kontakt" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Wiadomość" })).toHaveValue(new RegExp(`gmina ${gmina} rozważyła`));
});

test("J5: a gmina shows its indicators, what runs there and the gminas nearby", async ({ page }) => {
  await page.goto("/mapa?gmina=1214053");
  await expect(page.getByRole("heading", { level: 2, name: "Proszowice" })).toBeFocused();
  await expect(page.getByText(/na 10 tys\. mieszkańców \(2024\)/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Mobilna pomoc terapeutyczna" })).toBeVisible();
  await page.getByRole("link", { name: "Połącz z gminą, która już to wdrożyła" }).first().click();
  await expect(page.getByText(/skontaktuje Cię z gminą/)).toBeVisible();
});

test("J10: a sentence about a crisis shows human help, not innovations", async ({ page }) => {
  await page.goto("/");
  await problem(page).fill("Nie daję już rady, nie chcę żyć, proszę o pomoc.");
  await page.getByRole("button", { name: "Znajdź drogę" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nie jesteś z tym sam ani sama" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("link", { name: /^112/ })).toHaveAttribute("href", "tel:112");
  await expect(page.getByRole("region", { name: "Rozwiązania" })).toHaveCount(0);
});

test("the short text is refused with an error linked to the field", async ({ page }) => {
  await page.goto("/");
  await problem(page).fill("Za krótko");
  await page.getByRole("button", { name: "Znajdź drogę" }).click();
  await expect(page.getByRole("group", { name: "Sprawdź formularz" })).toBeFocused();
  await page.getByRole("link", { name: "Opisz problem w co najmniej 20 znakach" }).click();
  await expect(problem(page)).toBeFocused();
});

test("FR-2.2: the gmina picker ignores diacritics and lists Kraków first", async ({ page }) => {
  await page.goto("/");
  const gmina = page.getByRole("combobox", { name: "Gmina" });
  await gmina.fill("krak");
  await expect(page.getByRole("option").first()).toHaveText("Kraków, miasto na prawach powiatu");
  await gmina.fill("zakop");
  await gmina.press("ArrowDown");
  await gmina.press("Enter");
  await expect(gmina).toHaveValue(/^Zakopane, powiat tatrzański$/);
  await expect(page.getByRole("listbox")).toBeHidden();
});

test("the view settings apply at once and survive a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^A\+ / }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "2");
  await page.getByRole("button", { name: "Wersja kontrastowa" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "on");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-text-size", "2");
  await expect(page.getByRole("button", { name: "Wersja kontrastowa" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^A / }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-text-size", /.*/);
});

test("the first Tab reaches the skip link, which moves focus to the content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Przejdź do treści" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tresc")).toBeFocused();
});

test("J3: a contact request reaches the ROPS console, is relayed and exported", async ({ page }) => {
  const name = `Osoba testowa ${Date.now()}`;
  await page.goto("/droga/przyklad-seniorzy");
  await page.getByRole("region", { name: "Rozwiązania" }).getByRole("link", { name: "Poproś o kontakt" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Poproś o kontakt" })).toBeVisible();
  await page.getByLabel("Imię i nazwisko").fill(name);
  await page.getByLabel("E-mail", { exact: true }).fill("osoba@example.org");
  await page.getByRole("checkbox", { name: /użył moich danych/ }).check();
  await page.getByRole("button", { name: "Wyślij prośbę" }).click();
  await expect(page.getByText("Przekazaliśmy prośbę do ROPS")).toBeVisible();

  await page.goto("/rops");
  await page.getByLabel("Kod dostępu").fill("zly-kod");
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await expect(page.getByText("Ten kod nie pasuje")).toBeVisible();
  await page.getByLabel("Kod dostępu").fill(CONSOLE_TOKEN);
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Moderacja" })).toBeVisible();

  const queue = page.getByRole("region", { name: /^Prośby o kontakt do przekazania: \d+$/ });
  await queue.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: "Przekaż" }).click();
  await expect(queue.getByRole("status")).toHaveText("Przekazano prośbę o kontakt.");
  await expect(queue.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(queue.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);

  await page.getByRole("link", { name: "Prośby o kontakt" }).click();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("Zatwierdzona");
  await expect(row.getByLabel("Status")).toHaveValue("przekazane");

  const response = await page.request.get("/api/rops/eksport/kontakty");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const csv = await response.text();
  expect(csv.startsWith("﻿id;data;")).toBe(true);
  expect(csv).toContain(name);
});

test("the console asks for the code and returns to the requested page", async ({ page, request }) => {
  await page.goto("/rops/potrzeby");
  await expect(page.getByRole("heading", { level: 1, name: "Konsola ROPS" })).toBeVisible();
  await page.getByLabel("Kod dostępu").fill(CONSOLE_TOKEN);
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Potrzeby" })).toBeVisible();
  await expect(page).toHaveURL(/\/rops\/potrzeby$/);
  await expect(page.getByText("Przykład").first()).toBeVisible();

  // FR-9.2: the category filter keeps the view in the address.
  await page.getByLabel("Kategoria").selectOption("seniorzy");
  await page.getByRole("button", { name: "Pokaż" }).click();
  await expect(page).toHaveURL(/kategoria=seniorzy/);
  await expect(page.getByText("Samotni seniorzy w gminie wiejskiej")).toBeVisible();
  await expect(page.getByText("Młodzież nie ma gdzie się spotykać")).toHaveCount(0);

  const anonymous = await request.get("/api/rops/eksport/potrzeby");
  expect(anonymous.status()).toBe(401);
});

test("a saved need is rejected with a reason in the console, and its status is saved", async ({ page }) => {
  const stamp = Date.now();
  const text = `Potrzeba testowa ${stamp}: brakuje opieki wytchnieniowej dla opiekunów.`;
  const note = `Notatka testowa ${stamp}`;
  await page.goto("/zapisz-potrzebe");
  await page.getByRole("textbox", { name: "Opis potrzeby" }).fill(text);
  await page.getByRole("checkbox", { name: /przechowywał opis potrzeby/ }).check();
  await page.getByRole("checkbox", { name: /pokazanie potrzeby/ }).check();
  await page.getByRole("button", { name: "Zapisz potrzebę" }).click();
  await expect(page.getByText("Zapisaliśmy potrzebę w banku potrzeb")).toBeVisible();

  await page.goto("/rops");
  await page.getByLabel("Kod dostępu").fill(CONSOLE_TOKEN);
  await page.getByRole("button", { name: "Zaloguj" }).click();
  const queue = page.getByRole("region", { name: /^Potrzeby do publikacji: \d+$/ });
  const row = queue.getByRole("row").filter({ hasText: text });
  await expect(row).toHaveCount(1);

  // A rejection without a reason is refused at the field, and the note stays.
  await row.getByRole("textbox", { name: "Notatka" }).fill(note);
  await row.getByRole("button", { name: "Odrzuć" }).click();
  const reason = row.getByRole("combobox", { name: "Powód, jeśli odrzucasz" });
  await expect(reason).toBeFocused();
  await expect(reason).toHaveAccessibleDescription(/Wybierz powód odrzucenia/);
  await expect(row.getByRole("textbox", { name: "Notatka" })).toHaveValue(note);

  await reason.selectOption("spam");
  await row.getByRole("button", { name: "Odrzuć" }).click();
  await expect(queue.getByRole("status")).toHaveText("Odrzucono wpis. Powód: Spam lub reklama.");
  await expect(queue.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(row).toHaveCount(0);
  const logged = page.getByRole("table", { name: "Dziennik działań" }).getByRole("row").filter({ hasText: note });
  await expect(logged).toContainText("Odrzucono");
  await expect(logged).toContainText("Spam lub reklama");

  await page.getByRole("link", { name: "Potrzeby", exact: true }).click();
  const need = page.getByRole("row").filter({ hasText: text });
  await expect(need).toContainText("Odrzucona");
  await need.getByLabel("Status").selectOption("w-analizie");
  await need.getByRole("textbox", { name: "Notatka" }).fill(note);
  await need.getByRole("button", { name: "Zapisz" }).click();
  await expect(need.getByRole("status")).toHaveText("Zapisano.");
  await expect(need.getByLabel("Status")).toHaveValue("w-analizie");
  await page.reload();
  await expect(need.getByLabel("Status")).toHaveValue("w-analizie");
  await expect(need.getByRole("textbox", { name: "Notatka" })).toHaveValue(note);
});
