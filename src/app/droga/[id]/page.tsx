import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeclinedView, OffTopicView } from "@/components/route/declined-view";
import { HumanHelp } from "@/components/route/human-help";
import { RouteView } from "@/components/route/route-view";
import { helplines } from "@/lib/catalogue";
import type { RouteMode } from "@/lib/contracts/route";
import { t, type MessageKey } from "@/lib/i18n";
import { routeToMarkdown } from "@/lib/route-markdown";
import { getRoute } from "@/lib/server/routes";

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
  const route = await getRoute(id);
  return { title: t(route ? titles[route.mode] : "notFound.meta.title") };
}

/** /droga/{id}: one permalink for every outcome (FR-4.7, 7.12). */
export default async function RoutePage({ params }: PageProps<"/droga/[id]">) {
  const { id } = await params;
  const route = await getRoute(id);
  if (!route) notFound();

  switch (route.mode) {
    case "redirected":
      return <HumanHelp placeName={route.input.place_name} helplines={helplines()} />;
    case "declined":
      return <DeclinedView route={route} />;
    case "off_topic":
      return <OffTopicView />;
    default:
      return <RouteView route={route} markdown={routeToMarkdown(route)} />;
  }
}
