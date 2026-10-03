"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { ExpressionSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { Maximize, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { t } from "@/lib/i18n";

/* The worker served from the installed package (src/app/vendor/maplibre). */
const WORKER_PATH = "/vendor/maplibre/maplibre-gl-worker.mjs";

/*
 * Colours of the lines and marks drawn over the classes; the classes come
 * from the server (MAP_COLORS). The map keeps these in every theme, like an
 * image, and its values stay readable in the legend and the table.
 */
const INK = "#14171a";
const PAPER = "#ffffff";
const MARK = "#f2a900";
const NO_DATA_LINE = "#454d57";

export interface MapSettings {
  label: string;
  bounds: [number, number, number, number];
  colors: string[];
  /** The class (0 to 4) of each gmina with a value; a gmina without one has no data. */
  classes: Record<string, number>;
  tooltips: Record<string, string>;
  marks: { terc: string; lon: number; lat: number; count: number }[];
  selected: string | null;
  highlighted: string[];
}

function fill(settings: MapSettings): ExpressionSpecification {
  const pairs = Object.entries(settings.classes).flatMap(([terc, index]) => [terc, settings.colors[index]]);
  return ["match", ["get", "terc"], ...pairs, PAPER] as unknown as ExpressionSpecification;
}

function style(settings: MapSettings, source: string): StyleSpecification {
  const tercs = Object.keys(settings.classes);
  const outline = (id: string, filter: ExpressionSpecification, width: number, color: string, dashed = false) => ({
    id,
    type: "line" as const,
    source: "gminy",
    filter,
    paint: { "line-color": color, "line-width": width, ...(dashed ? { "line-dasharray": [2, 1] } : {}) },
  });
  const highlighted: ExpressionSpecification = ["in", ["get", "terc"], ["literal", settings.highlighted]];
  const selected: ExpressionSpecification = ["==", ["get", "terc"], settings.selected ?? ""];
  return {
    version: 8,
    sources: {
      gminy: { type: "geojson", data: source },
      wdrozenia: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: settings.marks.map((mark) => ({
            type: "Feature",
            properties: { count: mark.count },
            geometry: { type: "Point", coordinates: [mark.lon, mark.lat] },
          })),
        },
      },
    },
    layers: [
      { id: "tlo", type: "background", paint: { "background-color": PAPER } },
      { id: "gminy", type: "fill", source: "gminy", paint: { "fill-color": fill(settings) } },
      { id: "granice", type: "line", source: "gminy", paint: { "line-color": PAPER, "line-width": 1 } },
      outline("brak-danych", ["!", ["in", ["get", "terc"], ["literal", tercs]]], 1.5, NO_DATA_LINE, true),
      outline("wyroznione-tlo", highlighted, 5, PAPER),
      outline("wyroznione", highlighted, 2, INK, true),
      outline("wybrana-tlo", selected, 6, PAPER),
      outline("wybrana", selected, 3, INK),
      {
        id: "znaczniki",
        type: "circle",
        source: "wdrozenia",
        paint: {
          "circle-color": MARK,
          "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 6, 5, 11],
          "circle-stroke-color": INK,
          "circle-stroke-width": 2,
        },
      },
    ],
  };
}

/**
 * The choropleth of S4 (FR-7.1, FR-7.3) on MapLibre GL with the local
 * GeoJSON only, no basemap. It starts once its box is visible (the table
 * comes first on a phone and at A++), zooms by buttons, so nothing needs
 * dragging (WCAG 2.5.7), and leaves the page's scrolling alone. The same
 * data is always in the table.
 */
export function GminaMap({ settings, hrefBase, tableHref }: { settings: MapSettings; hrefBase: string; tableHref: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState(true);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const config = JSON.stringify(settings);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const current: MapSettings = JSON.parse(config);
    let map: MapLibreMap | null = null;
    let cancelled = false;

    async function start(container: HTMLDivElement) {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || map) return;
        maplibre.setWorkerUrl(new URL(WORKER_PATH, window.location.href).href);
        const source = new URL("/api/map/gminy.geojson", window.location.href).href;
        map = new maplibre.Map({
          container,
          style: style(current, source),
          bounds: current.bounds,
          fitBoundsOptions: { padding: 12 },
          attributionControl: false,
          scrollZoom: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          locale: { "Map.Title": current.label },
        });
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;
        const canvas = map.getCanvas();
        map.on("mousemove", "gminy", (event) => {
          const terc = event.features?.[0]?.properties?.terc as string | undefined;
          canvas.style.cursor = terc ? "pointer" : "";
          setTip(terc ? { text: current.tooltips[terc] ?? "", x: event.point.x, y: event.point.y } : null);
        });
        map.on("mouseleave", "gminy", () => {
          canvas.style.cursor = "";
          setTip(null);
        });
        map.on("click", "gminy", (event) => {
          const terc = event.features?.[0]?.properties?.terc as string | undefined;
          if (terc) router.push(`${hrefBase}${terc}`);
        });
      } catch {
        setFailed(true);
      }
    }

    const observer = new ResizeObserver(() => {
      if (box.clientWidth === 0) return;
      if (map) map.resize();
      else void start(box);
    });
    observer.observe(box);
    return () => {
      cancelled = true;
      observer.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, [config, hrefBase, router]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("znaczniki")) map.setLayoutProperty("znaczniki", "visibility", marks ? "visible" : "none");
  }, [marks]);

  if (failed) {
    return (
      <Notice tone="warning" title={t("map.failed.title")}>
        <p>
          {t("map.failed.text")} <Link href={tableHref}>{t("map.showTable")}</Link>
        </p>
      </Notice>
    );
  }

  return (
    <div className="grid gap-3">
      <div role="group" aria-label={t("map.controls.label")} className="no-print flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => mapRef.current?.zoomIn()}>
          <Plus aria-hidden />
          {t("map.controls.zoomIn")}
        </Button>
        <Button variant="secondary" onClick={() => mapRef.current?.zoomOut()}>
          <Minus aria-hidden />
          {t("map.controls.zoomOut")}
        </Button>
        <Button variant="secondary" onClick={() => mapRef.current?.fitBounds(settings.bounds, { padding: 12 })}>
          <Maximize aria-hidden />
          {t("map.controls.reset")}
        </Button>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-input px-3">
          <input
            type="checkbox"
            checked={marks}
            onChange={(event) => setMarks(event.target.checked)}
            className="size-5 accent-foreground"
          />
          {t("map.controls.implementations")}
        </label>
      </div>
      <div className="relative">
        <div ref={boxRef} className="h-[26rem] w-full overflow-hidden rounded-lg border border-border bg-white @4xl:h-[34rem]" />
        {tip && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 max-w-[16rem] rounded-md border border-input bg-background px-2 py-1 text-[0.95rem] text-foreground shadow"
            style={{ left: tip.x + 14, top: tip.y + 14 }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}
