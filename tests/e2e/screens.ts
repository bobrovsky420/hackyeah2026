import type { Page } from "@playwright/test";

/** Every screen of section 10 the prototype has, with a path that shows it filled. */
export const screens: { name: string; path: string; console?: boolean }[] = [
  { name: "s1-start", path: "/" },
  { name: "s2-droga", path: "/droga/przyklad-seniorzy" },
  { name: "s3-czesciowe", path: "/droga/przyklad-mlodziez" },
  { name: "s3-brak", path: "/droga/przyklad-dzieci" },
  { name: "s5-innowacja", path: "/innowacja/inn-nat-649?droga=przyklad-seniorzy" },
  { name: "s9a-kontakt", path: "/kontakt?innowacja=inn-nat-649&droga=przyklad-seniorzy" },
  { name: "s9b-chce-pomoc", path: "/chce-pomoc" },
  { name: "s9c-zapisz-potrzebe", path: "/zapisz-potrzebe?droga=przyklad-mlodziez" },
  { name: "s10-pomoc", path: "/droga/pomoc-czlowieka" },
  { name: "s11-odmowa", path: "/droga/z-tym-nie-pomozemy" },
  { name: "s11-inny-cel", path: "/droga/inny-cel" },
  { name: "s8-jak-to-dziala", path: "/jak-to-dziala" },
  { name: "s12-zasady", path: "/zasady" },
  { name: "s8-zrodla", path: "/zrodla" },
  { name: "s8-prywatnosc", path: "/prywatnosc" },
  { name: "s8-dostepnosc", path: "/dostepnosc" },
  { name: "s4-mapa", path: "/mapa" },
  { name: "404", path: "/nie-ma-takiej-strony" },
  { name: "s7-logowanie", path: "/rops" },
  { name: "s7-moderacja", path: "/rops", console: true },
  { name: "s7-potrzeby", path: "/rops/potrzeby", console: true },
  { name: "s7-kontakty", path: "/rops/kontakty", console: true },
  { name: "s7-gotowosc", path: "/rops/gotowosc", console: true },
  { name: "s7-miary", path: "/rops/miary", console: true },
];

/** The console's access code: ROPS_TOKEN, or the prototype's default. */
export const CONSOLE_TOKEN = process.env.ROPS_TOKEN || "rops-prototyp";

/** Signs the page in to the ROPS console by setting its cookie. */
export async function signIn(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([{ name: "rops_token", value: CONSOLE_TOKEN, url: baseURL ?? "http://localhost:3100" }]);
}

/** The three themes of the tokens: the device's light and dark, and "Wersja kontrastowa". */
export const themes: Record<string, (page: Page) => Promise<void>> = {
  standard: async () => {},
  ciemny: async (page) => {
    await page.emulateMedia({ colorScheme: "dark" });
  },
  kontrastowy: async (page) => {
    await page.addInitScript(() => localStorage.setItem("view:contrast", "on"));
  },
};
