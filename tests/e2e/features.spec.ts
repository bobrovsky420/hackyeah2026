import { expect, test, type Page } from "@playwright/test";
import { E2E_ROPS_TOKEN } from "./admin";

/*
 * The MUST requirements of section 7 around the journeys: the gate's
 * redaction and crisis banner, the quick exit, the clarification, the rate
 * limit, the path selection, the recompute, the content report, the MIIS
 * attribution, the accessibility statement, the register card, the map
 * table, the idea card of module III, the tester of module IV, the
 * conversations and the partnership board of module V and the panel of
 * module VI.
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

test("FR-12.9: a content report is stored for ROPS", async ({ page }) => {
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

test("module III: an idea card is checked field by field, stored, and its page shows similar innovations", async ({ page }) => {
  await page.goto("/zglos-pomysl");
  await page.getByRole("button", { name: "Zapisz fiszkę" }).click();
  const summary = page.getByRole("group", { name: "Sprawdź formularz" });
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveCount(8);
  await summary.getByRole("link", { name: "Wpisz nazwę pomysłu." }).click();
  await expect(page.getByLabel("Nazwa pomysłu")).toBeFocused();

  await page.getByLabel("Nazwa pomysłu").fill("Wspólne gotowanie seniorów i młodzieży");
  await page.getByLabel("Krótki opis").fill("Raz w tygodniu seniorzy gotują w świetlicy razem z młodzieżą ze szkoły, a potem zostają na rozmowę.");
  await page.getByLabel("Co jest jego istotą?").fill("Wspólny posiłek daje powód, żeby wyjść z domu.");
  await page.getByLabel("Komu jest dedykowany?").fill("Samotni seniorzy w małych wsiach.");
  await page.getByRole("radio", { name: "Testowany w małej skali" }).check();
  await page.getByLabel("Imię i nazwisko lub nazwa organizacji").fill("Koło Gospodyń Wiejskich");
  await page.getByLabel("E-mail", { exact: true }).fill("kgw@example.org");
  await page.getByRole("checkbox", { name: /przechowywał fiszkę/ }).check();
  await page.getByRole("button", { name: "Zapisz fiszkę" }).click();
  await expect(page.getByText("Zapisaliśmy fiszkę pomysłu")).toBeVisible();

  await page.getByRole("link", { name: "Zobacz fiszkę" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Wspólne gotowanie seniorów i młodzieży" })).toBeFocused();
  await expect(page.getByText("Testowany w małej skali")).toBeVisible();
  const similar = page.getByRole("region", { name: "Podobne sprawdzone rozwiązania" });
  await expect(similar.getByRole("listitem").first()).toBeVisible({ timeout: 20_000 });
  await expect(similar.getByText(/dopasowanie \d+ na 100/).first()).toBeVisible();
  // The author's contact is never shown on the card.
  await expect(page.getByText("kgw@example.org")).toHaveCount(0);
});

test("module III: a crisis text in an idea card shows human help, and nothing is stored", async ({ page }) => {
  await page.goto("/zglos-pomysl");
  await page.getByLabel("Nazwa pomysłu").fill("Pomysł");
  await page.getByLabel("Krótki opis").fill("Nie daję już rady, nie chcę żyć, proszę o pomoc dla mnie.");
  await page.getByLabel("Co jest jego istotą?").fill("Nie chcę już żyć.");
  await page.getByLabel("Komu jest dedykowany?").fill("Dla mnie.");
  await page.getByRole("radio", { name: "Pomysł, jeszcze nie zaczęty" }).check();
  await page.getByLabel("Imię i nazwisko lub nazwa organizacji").fill("Osoba");
  await page.getByLabel("E-mail", { exact: true }).fill("osoba@example.org");
  await page.getByRole("checkbox", { name: /przechowywał fiszkę/ }).check();
  await page.getByRole("button", { name: "Zapisz fiszkę" }).click();
  await expect(page.getByRole("link", { name: /^112/ })).toHaveAttribute("href", "tel:112");
  await expect(page.getByText("Zapisaliśmy fiszkę pomysłu")).toHaveCount(0);
});

test("module IV: an evaluation with a test sign-up is stored and the innovation shows only the numbers", async ({ page }) => {
  // An innovation no other test evaluates, so the counts start at zero.
  await page.goto("/innowacja/inn-rops-senior-cuder");
  const section = page.getByRole("region", { name: "Opinie i testy" });
  await expect(section.getByText(/Nikt jeszcze nie ocenił/)).toBeVisible();
  await section.getByRole("link", { name: "Oceń albo zgłoś się do testów" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Oceń rozwiązanie albo zgłoś się do testów" })).toBeVisible();

  await page.getByRole("button", { name: "Wyślij opinię" }).click();
  await expect(page.getByRole("group", { name: "Sprawdź formularz" }).getByRole("link")).toHaveCount(2);

  await page.getByRole("checkbox", { name: "Chcę wziąć udział w testach tego rozwiązania" }).check();
  await page.getByRole("button", { name: "Wyślij opinię" }).click();
  await expect(page.getByRole("group", { name: "Sprawdź formularz" }).getByRole("link")).toHaveCount(4);

  await page.getByRole("radio", { name: "5, bardzo dobrze" }).check();
  await page.getByRole("radio", { name: "Z wdrażania go w mojej instytucji lub organizacji" }).check();
  await page.getByLabel("Twoja opinia").fill("Seniorzy chętnie przychodzą, ale przygotowanie zajmuje dużo czasu.");
  await page.getByLabel("Propozycja usprawnienia").fill("Gotowy zestaw materiałów na pierwsze spotkanie.");
  await page.getByRole("radio", { name: "Jako organizacja lub instytucja, która wdroży je na próbę" }).check();
  await page.getByLabel("Imię i nazwisko lub nazwa organizacji").fill("Stowarzyszenie Razem");
  await page.getByLabel("E-mail", { exact: true }).fill("razem@example.org");
  await page.getByRole("checkbox", { name: /przechowywał moją opinię/ }).check();
  await page.getByRole("button", { name: "Wyślij opinię" }).click();
  await expect(page.getByText(/Zapisaliśmy też Twoje zgłoszenie do testów/)).toBeVisible();

  await page.getByRole("link", { name: "Wróć do opisu rozwiązania" }).last().click();
  await expect(section.getByText("5 na 5 (1 ocena)")).toBeVisible();
  await expect(section.getByText(/Seniorzy chętnie przychodzą/)).toHaveCount(0);
  await expect(page.getByText("razem@example.org")).toHaveCount(0);
});

test("module IV: an anonymous rating needs no name or e-mail address", async ({ page }) => {
  await page.goto("/innowacja/inn-nat-865/testuj");
  await page.getByRole("radio", { name: "4, dobrze" }).check();
  await page.getByRole("checkbox", { name: /przechowywał moją opinię/ }).check();
  await page.getByRole("button", { name: "Wyślij opinię" }).click();
  await expect(page.getByText("Dziękujemy za opinię")).toBeVisible();
});

test("module VI: the panel opens with the code, and the reply reaches the author's card", async ({ page }) => {
  await page.goto("/rops");
  await page.getByLabel("Twoje imię i nazwisko lub inicjały").fill("Anna Testowa");
  await page.getByLabel("Kod dostępu").fill("zly-kod");
  await page.getByRole("button", { name: "Wejdź do panelu" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Nie udało się zalogować" })).toContainText("Kod dostępu jest nieprawidłowy.");

  await page.getByLabel("Twoje imię i nazwisko lub inicjały").fill("Anna Testowa");
  await page.getByLabel("Kod dostępu").fill(E2E_ROPS_TOKEN);
  await page.getByRole("button", { name: "Wejdź do panelu" }).click();
  await expect(page.getByText("Zalogowano jako Anna Testowa")).toBeVisible();
  await expect(page.getByRole("link", { name: "Fiszki pomysłów" }).first()).toBeVisible();

  await page.goto("/rops/pomysly/pm-przyklad-1");
  await page.getByRole("combobox", { name: "Status fiszki", exact: true }).selectOption("przyjety");
  await page.getByRole("textbox", { name: "Odpowiedź dla autora", exact: true }).fill("Pomysł przyjęty do najbliższego naboru inkubatora.");
  await page.getByRole("button", { name: "Zapisz status i odpowiedź" }).click();
  await expect(page.getByRole("status").getByText("Zapisano")).toBeVisible();

  await page.goto("/pomysl/pm-przyklad-1");
  const reply = page.getByRole("region", { name: "Status i odpowiedź ROPS" });
  await expect(reply.getByText("Przyjęty do dalszej pracy")).toBeVisible();
  await expect(reply.getByText("Pomysł przyjęty do najbliższego naboru inkubatora.")).toBeVisible();

  await page.goto("/rops");
  await expect(page.getByText(/Anna Testowa, odpowiedz, idea pm-przyklad-1/)).toBeVisible();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page.getByRole("button", { name: "Wejdź do panelu" })).toBeVisible();
});

test("module VI: a verified innovation with a film shows on the route at once, a hidden one leaves it", async ({ page }) => {
  await page.goto("/rops");
  await page.getByLabel("Twoje imię i nazwisko lub inicjały").fill("Anna Testowa");
  await page.getByLabel("Kod dostępu").fill(E2E_ROPS_TOKEN);
  await page.getByRole("button", { name: "Wejdź do panelu" }).click();
  await expect(page.getByText("Zalogowano jako Anna Testowa")).toBeVisible();

  // An innovation of the example route "przyklad-mlodziez", which no other journey reads.
  await page.goto("/rops/wiedza?q=pomosty");
  await page.getByRole("status").getByRole("link").first().click();
  await page.getByRole("radio", { name: "Sprawdzone przez ROPS" }).check();
  await page.getByLabel("Tytuł").fill("Film o rozwiązaniu");
  await page.getByLabel("Adres strony lub pliku").fill("https://www.youtube.com/watch?v=e2e");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("status").getByText("Zapisano")).toBeVisible();

  await page.goto("/droga/przyklad-mlodziez");
  await expect(page.getByRole("article").filter({ hasText: "PoMOSty" }).getByText("Sprawdzone przez ROPS")).toBeVisible();
  await page.goto("/innowacja/inn-nat-pomosty");
  await expect(page.getByText("Sprawdzone przez ROPS")).toBeVisible();
  await expect(page.getByRole("link", { name: "Film o rozwiązaniu" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=e2e");

  await page.goto("/rops/innowacje/inn-nat-pomosty");
  await page.getByRole("radio", { name: "Ukryj w drogach i na stronie rozwiązania" }).check();
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("status").getByText("Zapisano")).toBeVisible();
  await page.goto("/droga/przyklad-mlodziez");
  await expect(page.getByRole("article").filter({ hasText: "PoMOSty" })).toHaveCount(0);
  expect((await page.goto("/innowacja/inn-nat-pomosty"))?.status()).toBe(404);
});

test("module VI: the panel and its export stay closed without a session", async ({ page, request }) => {
  await page.goto("/rops/pomysly/pm-przyklad-1");
  await expect(page.getByRole("button", { name: "Wejdź do panelu" })).toBeVisible();
  await expect(page.getByText("pm-przyklad-1@example.org")).toHaveCount(0);
  expect((await request.get("/api/admin/export/ideas")).status()).toBe(401);
});

async function signIn(page: Page) {
  await page.goto("/rops");
  await page.getByLabel("Twoje imię i nazwisko lub inicjały").fill("Anna Testowa");
  await page.getByLabel("Kod dostępu").fill(E2E_ROPS_TOKEN);
  await page.getByRole("button", { name: "Wejdź do panelu" }).click();
  await expect(page.getByText("Zalogowano jako Anna Testowa")).toBeVisible();
}

test("module V: a question gets a private link, ROPS answers and invites a mentor, the mentor answers", async ({ page, context }) => {
  await page.goto("/zapytaj?innowacja=inn-nat-649&temat=mentor");
  await expect(page.getByText(/Rozmowa o rozwiązaniu:/)).toBeVisible();
  await page.getByLabel("Wiadomość", { exact: true }).fill("Chcemy uruchomić takie warsztaty w szkole. Jak przygotować uczniów?");
  await page.getByLabel("Imię i nazwisko lub nazwa organizacji").fill("Szkoła Testowa e2e");
  await page.getByRole("checkbox", { name: /przechowywał tę rozmowę/ }).check();
  await page.getByRole("button", { name: "Wyślij wiadomość" }).click();
  await expect(page.getByText("To jest Twój prywatny link do rozmowy.")).toBeVisible();
  await page.getByRole("link", { name: "Otwórz rozmowę" }).click();
  const authorUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Pytanie o: Kapsuła czasu/);
  await expect(page.getByText("Czekamy na odpowiedź ROPS.")).toBeVisible();

  // A wrong key shows nothing of the conversation.
  const wrong = authorUrl.replace(/klucz=[^&]+/, "klucz=zly-klucz");
  expect((await page.goto(wrong))?.status()).toBe(404);

  await signIn(page);
  await page.goto("/rops/rozmowy");
  await page.getByRole("link", { name: "Pytanie o: Kapsuła czasu - recepta na samotność" }).first().click();
  await page.getByLabel("Odpowiedź ROPS").fill("Dziękujemy. Zapraszamy do rozmowy ekspertkę.");
  await page.getByRole("button", { name: "Wyślij odpowiedź" }).click();
  await expect(page.getByRole("status").getByText("Zapisano")).toBeVisible();
  await page.getByRole("button", { name: "Zaproś i utwórz link" }).click();
  const mentorLink = (await page.getByRole("status").filter({ hasText: "Nowy link dla mentora" }).locator("p.font-mono").textContent()) ?? "";
  expect(mentorLink).toMatch(/\/rozmowa\/rz-[^?]+\?klucz=/);

  // The mentor opens their own link in a browser without the panel.
  const mentorPage = await context.browser()!.newPage();
  await mentorPage.goto(mentorLink);
  await expect(mentorPage.getByText("Piszesz jako mentor")).toBeVisible();
  await mentorPage.getByLabel("Odpowiedź mentora").fill("Zacznijcie od dwóch próbnych lekcji pod okiem nauczyciela.");
  await mentorPage.getByRole("button", { name: "Wyślij", exact: true }).click();
  await expect(mentorPage.getByText("Autor rozmowy i ROPS zobaczą Twoją odpowiedź.")).toBeVisible();
  await mentorPage.close();

  await page.goto(authorUrl);
  await expect(page.getByText("Dziękujemy. Zapraszamy do rozmowy ekspertkę.")).toBeVisible();
  await expect(page.getByText("Zacznijcie od dwóch próbnych lekcji pod okiem nauczyciela.")).toBeVisible();
  await page.getByLabel("Twoja wiadomość").fill("Dziękujemy!");
  await page.getByRole("button", { name: "Wyślij", exact: true }).click();
  await expect(page.getByText("ROPS zobaczy Twoją wiadomość w swoim panelu.")).toBeVisible();

  await page.goto("/rozmowy");
  await expect(page.getByRole("link", { name: "Pytanie o: Kapsuła czasu - recepta na samotność" })).toBeVisible();
});

test("module V: a partnership post waits for ROPS, then an answer reaches ROPS, never the author's contact", async ({ page }) => {
  await page.goto("/partnerstwa/nowe");
  await page.getByLabel("Tytuł ogłoszenia").fill("Szukamy firmy do wsparcia warsztatów e2e");
  await page.getByLabel("Opis").fill("Prowadzimy warsztaty komputerowe dla seniorów i szukamy firmy, która przekaże laptopy.");
  await page.getByRole("radio", { name: "Instytucja publiczna, na przykład szkoła lub ośrodek pomocy" }).check();
  await page.getByRole("checkbox", { name: "Firma" }).check();
  await page.getByLabel("Imię i nazwisko lub nazwa organizacji").fill("Szkoła e2e");
  await page.getByLabel("E-mail", { exact: true }).fill("szkola-e2e@example.org");
  await page.getByRole("checkbox", { name: /przechowywał ogłoszenie/ }).check();
  await page.getByRole("button", { name: "Wyślij ogłoszenie" }).click();
  await expect(page.getByText(/Ogłoszenie czeka na sprawdzenie przez ROPS/)).toBeVisible();

  await page.goto("/partnerstwa");
  await expect(page.getByRole("heading", { name: "Szukamy firmy do wsparcia warsztatów e2e" })).toHaveCount(0);

  await signIn(page);
  await page.goto("/rops/partnerstwa");
  const post = page.getByRole("listitem").filter({ hasText: "Szukamy firmy do wsparcia warsztatów e2e" });
  await post.getByRole("button", { name: "Zatwierdź i pokaż na tablicy" }).click();
  await expect(page.getByRole("status").getByText("Zapisano")).toBeVisible();

  await page.goto("/partnerstwa");
  const card = page.getByRole("article").filter({ hasText: "Szukamy firmy do wsparcia warsztatów e2e" });
  await expect(card).toBeVisible();
  await expect(page.getByText("szkola-e2e@example.org")).toHaveCount(0);
  await card.getByRole("link", { name: "Chcę współpracować" }).click();
  await expect(page.getByText(/Odpowiedź na ogłoszenie:/)).toBeVisible();
  await page.getByLabel("Wiadomość", { exact: true }).fill("Jesteśmy firmą informatyczną i możemy przekazać pięć laptopów.");
  await page.getByLabel("Imię i nazwisko lub nazwa organizacji").fill("Firma e2e");
  await page.getByRole("checkbox", { name: /przechowywał tę rozmowę/ }).check();
  await page.getByRole("button", { name: "Wyślij wiadomość" }).click();
  await expect(page.getByText("To jest Twój prywatny link do rozmowy.")).toBeVisible();

  await page.goto("/rops/partnerstwa");
  await expect(page.getByRole("listitem").filter({ hasText: "Szukamy firmy do wsparcia warsztatów e2e" }).getByRole("link", { name: /Firma e2e/ })).toBeVisible();
});
