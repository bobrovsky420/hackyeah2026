import { createHmac } from "node:crypto";
import type { BrowserContext } from "@playwright/test";

/*
 * The panel of module VI in the Playwright runs: playwright.config.ts gives
 * the production build this code (ROPS_TOKEN), and a screen check enters
 * with the session cookie the server would set, so it needs no login.
 */
export const E2E_ROPS_TOKEN = "e2e-kod-rops";

export async function enterPanel(context: BrowserContext, baseURL: string) {
  const value = createHmac("sha256", E2E_ROPS_TOKEN).update("hubmi-rops-session-v1").digest("hex");
  const url = new URL(baseURL);
  await context.addCookies([
    { name: "rops_sesja", value, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Strict" },
    { name: "rops_osoba", value: "Test e2e", domain: url.hostname, path: "/", httpOnly: true, sameSite: "Strict" },
  ]);
}
