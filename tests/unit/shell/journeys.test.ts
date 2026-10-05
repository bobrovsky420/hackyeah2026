import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { journeyOf } from "@/lib/journeys";

/* The journey colours of decision U.10: which page belongs to which journey, and the contrast of every step in src/app/globals.css. */

describe("journeyOf", () => {
  it("gives each public path its journey, and none to a page of every journey", () => {
    expect(journeyOf("/")).toBe("need");
    expect(journeyOf("/droga/rt-1")).toBe("need");
    expect(journeyOf("/zapisz-potrzebe")).toBe("need");
    expect(journeyOf("/zglos-pomysl/canvas")).toBe("idea");
    expect(journeyOf("/pomysl/pm-1")).toBe("idea");
    expect(journeyOf("/chce-pomoc")).toBe("help");
    expect(journeyOf("/partnerstwa/nowe")).toBe("help");
    expect(journeyOf("/zapytaj")).toBe("ask");
    expect(journeyOf("/rozmowa/th-1")).toBe("ask");
    for (const other of ["/rozmowy", "/mapa", "/jak-to-dziala", "/innowacja/inn-1", "/rops"]) expect(journeyOf(other)).toBeNull();
  });
});

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** The custom properties of the first block that `start` opens. */
function block(start: string): Record<string, string> {
  const from = css.indexOf(start);
  const body = css.slice(css.indexOf("{", from) + 1, css.indexOf("}", from));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2].toLowerCase()]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("the journey colours", () => {
  const themes = { light: block(":root {"), dark: block(':root:not([data-contrast="on"])'), contrast: block(':root[data-contrast="on"]') };

  for (const [name, theme] of Object.entries(themes)) {
    it(`keep text at 7:1 and lines at 3:1 in the ${name} theme`, () => {
      for (const journey of ["need", "idea", "help", "ask"]) {
        const [rule, ink, tint] = [theme[`${journey}-rule`], theme[`${journey}-ink`], theme[`${journey}-tint`]];
        expect([rule, ink, tint].every(Boolean), `${name} ${journey}`).toBe(true);
        expect(ratio(ink, theme.background), `${name} ${journey} ink on the page`).toBeGreaterThanOrEqual(7);
        expect(ratio(ink, tint), `${name} ${journey} ink on its tint`).toBeGreaterThanOrEqual(7);
        expect(ratio(rule, theme.background), `${name} ${journey} rule on the page`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
