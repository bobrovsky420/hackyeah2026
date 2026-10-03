import { cookies } from "next/headers";

/** The cookie that shows a new private link once, in the panel of the reviewer who made it (module V). */
export const LINK_COOKIE = "rops_nowy_link";

export interface FlashLink {
  threadId: string;
  path: string;
  kind: "mentor" | "autor";
}

/** The link just made for this conversation, while its cookie lives (two minutes), else null. */
export async function flashLinkFor(threadId: string): Promise<FlashLink | null> {
  const value = (await cookies()).get(LINK_COOKIE)?.value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as FlashLink;
    return parsed.threadId === threadId && typeof parsed.path === "string" && parsed.path.startsWith("/rozmowa/") ? parsed : null;
  } catch {
    return null;
  }
}
