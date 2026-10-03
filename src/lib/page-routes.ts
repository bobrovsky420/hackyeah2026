/**
 * Page folders in src/app have English names; the URLs a reader sees are
 * Polish (specification 9.5). next.config.ts serves each Polish URL from its
 * folder with a rewrite and redirects the folder's path to the Polish URL, so
 * a page has one address. Links, redirect() and tests use the Polish URLs.
 * The API keeps its English routes (9.2) and is not listed here.
 *
 * No "@/" imports: next.config.ts loads this file.
 */
export const PAGE_ROUTES: readonly { folder: string; url: string }[] = [
  { folder: "/route/:id", url: "/droga/:id" },
  { folder: "/innovation/:id", url: "/innowacja/:id" },
  { folder: "/need/:id/brief", url: "/potrzeba/:id/fiszka" },
  { folder: "/map", url: "/mapa" },
  { folder: "/how-it-works", url: "/jak-to-dziala" },
  { folder: "/rules", url: "/zasady" },
  { folder: "/sources", url: "/zrodla" },
  { folder: "/privacy", url: "/prywatnosc" },
  { folder: "/accessibility", url: "/dostepnosc" },
  { folder: "/contact", url: "/kontakt" },
  { folder: "/offer-help", url: "/chce-pomoc" },
  { folder: "/save-need", url: "/zapisz-potrzebe" },
  { folder: "/submit-idea", url: "/zglos-pomysl" },
  { folder: "/idea/:id", url: "/pomysl/:id" },
  { folder: "/report", url: "/zglos" },
];

const folderPatterns = PAGE_ROUTES.map(({ folder, url }) => ({
  pattern: new RegExp(`^${folder.replace(":id", "([^/]+)")}$`),
  url,
}));

/**
 * The Polish URL of a pathname. usePathname() reads the folder's path on the
 * server when a page is prerendered and the Polish URL in the browser;
 * passing both through here keeps the two renders the same.
 */
export function publicPath(pathname: string): string {
  for (const { pattern, url } of folderPatterns) {
    const match = pattern.exec(pathname);
    if (match) return match[1] ? url.replace(":id", match[1]) : url;
  }
  return pathname;
}
