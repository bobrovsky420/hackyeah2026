import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeclinedView, OffTopicView } from "@/components/route/declined-view";
import { HumanHelp } from "@/components/route/human-help";
import { RouteView } from "@/components/route/route-view";
import { t, type MessageKey } from "@/lib/i18n";
import { isRoleCode, roleLabel } from "@/lib/labels";
import { getGmina } from "@/lib/mock/data";
import { getMockRoute } from "@/lib/mock/routes";
import type { RouteMode } from "@/lib/mock/types";
import { placeLabel } from "@/lib/places";
import { routeToMarkdown } from "@/lib/route-markdown";

const titles: Record<RouteMode, MessageKey> = {
  route: "s2.meta.title",
  partial: "s3.meta.title",
  none: "s3.meta.title",
  redirected: "s10.meta.title",
  declined: "s11.meta.title",
  off_topic: "s11.offTopic.meta.title",
};

export async function generateMetadata({ params }: PageProps<"/droga/[id]">): Promise<Metadata> {
  const { id } = await params;
  const route = getMockRoute(id);
  return { title: t(route ? titles[route.mode] : "notFound.meta.title") };
}

/**
 * /droga/{id}: one permalink for every outcome (FR-4.7, 7.12). The intake
 * adds miejsce and rola; without them the example's own place applies.
 */
export default async function RoutePage({ params, searchParams }: PageProps<"/droga/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const route = getMockRoute(id);
  if (!route) notFound();

  const placeParam = typeof query.miejsce === "string" ? query.miejsce : undefined;
  const roleParam = typeof query.rola === "string" ? query.rola : undefined;
  const gmina = getGmina(placeParam ?? route.defaultPlaceTerc);
  const placeText = gmina ? placeLabel(gmina) : t("place.wholeRegion");
  const placeWhere = gmina ? t("place.inGmina", { name: gmina.name }) : t("place.inRegion");
  const roleCode = roleParam ?? route.defaultRole;
  const roleText = isRoleCode(roleCode) ? roleLabel(roleCode) : null;

  switch (route.mode) {
    case "redirected":
      return <HumanHelp placeName={gmina?.name ?? null} />;
    case "declined":
      return <DeclinedView route={route} />;
    case "off_topic":
      return <OffTopicView />;
    default:
      return (
        <RouteView
          route={route}
          placeText={placeText}
          placeWhere={placeWhere}
          roleText={roleText}
          markdown={routeToMarkdown(route, placeText, roleText)}
        />
      );
  }
}
