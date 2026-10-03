import type { Metadata } from "next";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

/** The ROPS panel (module VI): never indexed, never cached by a shared proxy. */
export const metadata: Metadata = {
  title: { default: t("admin.meta.title"), template: `%s - ${t("admin.meta.title")}` },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
