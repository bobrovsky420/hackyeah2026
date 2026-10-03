import type { Page } from "@playwright/test";
import { MAP_ENABLED } from "../../src/lib/features";

/** Every screen of section 10 the prototype has, with a path that shows it filled; `admin` screens are seen signed in to the panel. */
export const screens: { name: string; path: string; admin?: boolean }[] = [
  { name: "s1-start", path: "/" },
  { name: "s2-droga", path: "/droga/przyklad-seniorzy" },
  { name: "s2-przemoc", path: "/droga/przyklad-przemoc" },
  { name: "s2-usuniete-dane", path: "/droga/przyklad-usuniete-dane" },
  { name: "s3-czesciowe", path: "/droga/przyklad-mlodziez" },
  { name: "s3-zdrowie-psychiczne", path: "/droga/przyklad-zdrowie-psychiczne" },
  { name: "s3-brak", path: "/droga/przyklad-dzieci" },
  { name: "s3-doprecyzowanie", path: "/droga/przyklad-doprecyzowanie" },
  { name: "s5-innowacja", path: "/innowacja/inn-nat-649?droga=przyklad-seniorzy" },
  { name: "s5-miis", path: "/innowacja/inn-rops-senior-cuder" },
  { name: "s6-fiszka", path: "/potrzeba/nd-przyklad-3/fiszka" },
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
  ...(MAP_ENABLED
    ? [
        { name: "s4-mapa", path: "/mapa" },
        { name: "s4-tabela", path: "/mapa?widok=tabela" },
        { name: "s4-innowacja", path: "/mapa?innowacja=inn-nat-649" },
        { name: "s4-gmina", path: "/mapa?gmina=1214053" },
      ]
    : []),
  { name: "s12-zglos", path: "/zglos?droga=przyklad-seniorzy" },
  { name: "m3-zglos-pomysl", path: "/zglos-pomysl" },
  { name: "m3-fiszka-pomyslu", path: "/pomysl/pm-przyklad-1" },
  { name: "m4-tester", path: "/innowacja/inn-nat-649/testuj" },
  { name: "m5-zapytaj", path: "/zapytaj" },
  { name: "m5-zapytaj-ekspert", path: "/zapytaj?innowacja=inn-nat-649&temat=mentor" },
  { name: "m5-rozmowa", path: "/rozmowa/rz-przyklad-1?klucz=przyklad-rozmowa-1" },
  { name: "m5-rozmowa-mentor", path: "/rozmowa/rz-przyklad-1?klucz=przyklad-mentor-1" },
  { name: "m5-moje-rozmowy", path: "/rozmowy" },
  { name: "m5-tablica", path: "/partnerstwa" },
  { name: "m5-ogloszenie", path: "/partnerstwa/nowe" },
  { name: "m6-logowanie", path: "/rops" },
  { name: "m6-rozmowy", path: "/rops/rozmowy", admin: true },
  { name: "m6-rozmowa", path: "/rops/rozmowy/rz-przyklad-1", admin: true },
  { name: "m6-mentorzy", path: "/rops/mentorzy", admin: true },
  { name: "m6-partnerstwa", path: "/rops/partnerstwa", admin: true },
  { name: "m6-pulpit", path: "/rops", admin: true },
  { name: "m6-pomysly", path: "/rops/pomysly", admin: true },
  { name: "m6-fiszka", path: "/rops/pomysly/pm-przyklad-1", admin: true },
  { name: "m6-opinie", path: "/rops/opinie", admin: true },
  { name: "m6-potrzeby", path: "/rops/potrzeby", admin: true },
  { name: "m6-kontakty", path: "/rops/kontakty", admin: true },
  { name: "m6-gotowosc", path: "/rops/gotowosc", admin: true },
  { name: "m6-zgloszenia", path: "/rops/zgloszenia", admin: true },
  { name: "m6-trendy", path: "/rops/trendy", admin: true },
  { name: "m6-pytania", path: "/rops/trendy/pytania", admin: true },
  { name: "m6-trendy-pomysly", path: "/rops/trendy?widok=pomysly", admin: true },
  { name: "m6-trendy-drogi", path: "/rops/trendy?widok=drogi", admin: true },
  { name: "m6-wiedza", path: "/rops/wiedza?q=senior", admin: true },
  { name: "m6-wiedza-edycja", path: "/rops/wiedza/nowy", admin: true },
  { name: "m6-innowacja", path: "/rops/innowacje/inn-nat-649", admin: true },
  { name: "404", path: "/nie-ma-takiej-strony" },
];

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
