import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { ViewSettings } from "@/components/shell/view-settings";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CONTRAST_KEY, TEXT_SIZE_KEY } from "@/lib/storage-keys";
import "./globals.css";

/* next/font serves the fonts from our own server; browsers never call Google. */
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ui",
  display: "swap",
  // next/font has no metrics for Atkinson, so it cannot size-adjust a fallback font.
  adjustFontFallback: false,
});

const atkinsonMono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-code",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

/* Applies the saved view settings before the first paint, so the page never flashes. */
const applyViewSettings = `try{var d=document.documentElement,s=localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)});if(s==="2"||s==="3")d.dataset.textSize=s;if(localStorage.getItem(${JSON.stringify(CONTRAST_KEY)})==="on")d.dataset.contrast="on"}catch(e){}`;

export const metadata: Metadata = {
  title: { template: "%s - HubMI.pl", default: "HubMI.pl" },
  description: t("meta.description"),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={cn(atkinson.variable, atkinsonMono.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyViewSettings }} />
      </head>
      <body>
        <div className="@container flex min-h-screen flex-col">
          <a
            href="#tresc"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:font-bold"
          >
            {t("shell.skipLink")}
          </a>
          <div aria-hidden className="brand-ribbon no-print">
            <span className="bg-[#ec008b]" />
            <span className="bg-[#4b3f9e]" />
            <span className="bg-[#00b8f1]" />
            <span className="bg-[#8dc63f]" />
            <span className="bg-[#ffd200]" />
          </div>
          <ViewSettings />
          <SiteHeader />
          <main id="tresc" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-16 @3xl:px-8 @3xl:pt-12">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
