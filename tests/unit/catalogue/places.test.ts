import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalogue } from "@/lib/catalogue";
import { localityLabeller, type PlaceOption } from "@/lib/place-options";

/* FR-2.2: a town or village of Małopolska finds its gmina in the picker. */

const hasData = fs.existsSync(path.join(process.cwd(), "data", "places", "malopolska-localities.json"));

const places: PlaceOption[] = [
  { terc: "1207021", name: "Mszana Dolna", powiat: "limanowski", kind: "gmina miejska" },
  { terc: "1207092", name: "Mszana Dolna", powiat: "limanowski", kind: "gmina wiejska" },
  { terc: "1207082", name: "Laskowa", powiat: "limanowski", kind: "gmina wiejska" },
  { terc: "1261011", name: "Kraków", powiat: "Kraków", kind: "gmina miejska" },
];

describe("localityLabeller", () => {
  const label = localityLabeller(places);

  it("names the gmina and the powiat", () => {
    expect(label({ name: "Kamionka Mała", terc: "1207082" })).toBe("Kamionka Mała, gmina Laskowa, powiat limanowski");
  });

  it("adds the kind of gmina where the gmina's name is ambiguous", () => {
    expect(label({ name: "Mszana Górna", terc: "1207092" })).toBe("Mszana Górna, gmina wiejska Mszana Dolna, powiat limanowski");
  });

  it("names the city of a city gmina", () => {
    expect(label({ name: "Kraków-Nowa Huta", terc: "1261011" })).toBe("Kraków-Nowa Huta, miasto Kraków");
  });

  it("gives no label when the gmina is not in the list", () => {
    expect(label({ name: "Nowhere", terc: "1299999" })).toBeUndefined();
  });
});

describe.each([
  ["the fixtures", "mock"],
  ...(hasData ? [["data/", "data"]] : []),
])("the localities of %s", (_, source) => {
  const catalogue = loadCatalogue({ source, warn: () => {} });

  it("each lead to a gmina of Małopolska", () => {
    expect(catalogue.localities.length).toBeGreaterThan(1500);
    const orphans = catalogue.localities.filter((locality) => !catalogue.gminaByTerc.has(locality.terc));
    expect(orphans).toEqual([]);
  });

  it("leave out a locality named like its own gmina", () => {
    const same = catalogue.localities.filter((locality) => catalogue.gminaByTerc.get(locality.terc)?.name === locality.name);
    expect(same).toEqual([]);
  });
});
