import { fold } from "@/lib/text";

/*
 * Stand-in for the screening gate (7.12) and the matching engine: picks a
 * canned route by keywords. Order matters: crisis first, then harm, then
 * off-topic, then the example topics. Keywords are diacritics-free.
 */
const rules: { routeId: string; keywords: RegExp[] }[] = [
  {
    routeId: "pomoc-czlowieka",
    keywords: [/nie chce zyc/, /samobo/, /zabic sie/, /nie daje (juz )?rady/, /bije (dziecko|zone|meza)/, /przemoc domow/],
  },
  { routeId: "z-tym-nie-pomozemy", keywords: [/pozbyc sie/, /wyrzucic z/, /nie wpuszczac/, /zakazac wstepu/] },
  {
    routeId: "inny-cel",
    keywords: [/\btest\b/, /lorem/, /asdf/, /przepis na/, /sernik/, /wiersz/, /reklam/, /sprzedam/, /kupie/],
  },
  { routeId: "przyklad-mlodziez", keywords: [/mlodziez/, /nastolat/, /alkohol/, /przystan/] },
  { routeId: "przyklad-dzieci", keywords: [/ukrain/, /lekcj/, /korepetyc/, /cudzoziem/, /uchodz/] },
  { routeId: "przyklad-seniorzy", keywords: [/senior/, /starsz/, /emeryt/, /samotn/] },
];

export function pickScenario(problemText: string): string {
  const text = fold(problemText);
  const rule = rules.find(({ keywords }) => keywords.some((pattern) => pattern.test(text)));
  return rule?.routeId ?? "brak-rozwiazania";
}
