/*
 * Generate src/lib/data/schema-types.ts from the JSON Schemas in schemas/ and,
 * with --check, type-check every data file in data/ against src/lib/data/types.ts.
 *
 * Usage, from the repository root (Node.js with npx; nothing is added to package.json):
 *   node scripts/build-data-types.mjs            write src/lib/data/schema-types.ts
 *   node scripts/build-data-types.mjs --check    check the data files against the types
 *
 * Generation: json-schema-to-typescript, pinned below and run through npx, once per
 * schema. The root title of each schema becomes the type name (SourceRecord,
 * DerivedRecord); minItems and maxItems are ignored so arrays stay arrays; a
 * description next to a $ref is dropped so that one EvidenceItem type is emitted.
 *
 * Check: writes .local/type-check/check-data.ts, in which every data file is a typed
 * object literal (const x: T.BuiltInnovation = {...}), and runs the project's tsc on
 * it with its own tsconfig. Literals, not JSON imports: resolveJsonModule widens every
 * string to string, so an import cannot test the code unions, and an assigned variable
 * escapes the excess-property check that finds fields the types do not know. The
 * elements of a long array are checked one by one (is<Element>({...})), because tsc
 * gives up on the union type of 2 875 places. The YAML files are read with the yaml
 * package of the app; index-vectors.json is checked with its first three vectors. The check lives in .local/ (git-ignored) because the root tsconfig
 * includes every .ts file and the built data is not in git: a committed check would
 * break the typecheck of a fresh clone.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const JSON2TS = "json-schema-to-typescript@15.0.4";
const OUT = path.join(ROOT, "src", "lib", "data", "schema-types.ts");
const CHECK_DIR = path.join(ROOT, ".local", "type-check");
const SCHEMAS = [
  ["source-record.schema.json", "SourceRecord"],
  ["derived-record.schema.json", "DerivedRecord"],
];
const HEADER = "// generated from schemas/*.schema.json by scripts/build-data-types.mjs, do not edit\n";
// Closed lists of data/curated/taxonomies.json and the union of src/lib/data/types.ts that mirrors each.
const TAXONOMY_UNIONS = {
  target_groups: "TargetGroup",
  domains: "Domain",
  implementer_types: "ImplementerType",
  cost_bands: "CostBand",
  time_to_implement: "TimeToImplement",
  evidence_levels: "EvidenceLevel",
  settings: "Setting",
  scales: "Scale",
};

function npx(pkg, bin, args, input) {
  // npx is a .cmd file on Windows, which Node starts only through a shell.
  return execSync(`npx -y -p ${pkg} ${bin} ${args}`, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    stdio: ["pipe", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  }).replace(/\r\n/g, "\n");
}

function generate() {
  const parts = SCHEMAS.map(([file, name]) => {
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", file), "utf8"));
    schema.title = name;
    const dropRefDescriptions = (node) => {
      if (Array.isArray(node)) node.forEach(dropRefDescriptions);
      else if (node && typeof node === "object") {
        if ("$ref" in node) delete node.description;
        Object.values(node).forEach(dropRefDescriptions);
      }
    };
    dropRefDescriptions(schema);
    return npx(JSON2TS, "json2ts", '--ignoreMinAndMaxItems --bannerComment=""', JSON.stringify(schema)).trim();
  });
  fs.writeFileSync(OUT, HEADER + "\n" + parts.join("\n\n") + "\n");
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}

// A data value as a TypeScript literal of the given type expression.
function literal(value, type) {
  if (Array.isArray(value)) {
    if (value.length <= 50 || !value.every((e) => e && typeof e === "object" && !Array.isArray(e))) return JSON.stringify(value);
    return "[\n" + value.map((e) => `is<(${type})[number]>(${JSON.stringify(e)})`).join(",\n") + "\n]";
  }
  if (value && typeof value === "object") {
    const props = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${literal(v, `NonNullable<${type}>[${JSON.stringify(k)}]`)}`);
    return "{" + props.join(", ") + "}";
  }
  return JSON.stringify(value);
}

function check() {
  const lines = [
    'import type * as T from "../../src/lib/data/types";',
    "",
    "const is = <X,>(x: X): X => x;",
    "",
  ];
  let n = 0;
  const add = (label, type, value) => {
    n += 1;
    lines.push(`// ${label}`, `export const v${n}: T.${type} = ${literal(value, `T.${type}`)};`);
  };
  const file = (rel) => path.join(ROOT, "data", rel);
  const json = (rel) => JSON.parse(fs.readFileSync(file(rel), "utf8"));
  const missing = [];
  const checkFile = (rel, type, read = json) => {
    if (!fs.existsSync(file(rel))) {
      missing.push(rel);
      return null;
    }
    const value = read(rel);
    add(`data/${rel}`, type, value);
    return value;
  };

  const tax = checkFile("curated/taxonomies.json", "TaxonomiesFile");
  if (tax) {
    // The other direction: every member of a union is a code of the taxonomies.
    for (const [key, union] of Object.entries(TAXONOMY_UNIONS)) {
      const codes = JSON.stringify(tax[key].map((t) => t.code));
      lines.push(
        `const ${key}_codes = ${codes} as const satisfies readonly T.${union}[];`,
        `type ${key}_not_in_file = Exclude<T.${union}, (typeof ${key}_codes)[number]>;`,
        `export const ${key}_complete: [${key}_not_in_file] extends [never] ? true : ${key}_not_in_file = true;`,
      );
    }
  }
  const pathsDir = file("built/paths");
  const paths = fs.existsSync(pathsDir) ? fs.readdirSync(pathsDir).filter((f) => f.endsWith(".yaml")).sort() : [];
  const yaml = (rel) => YAML.parse(fs.readFileSync(file(rel), "utf8"));
  checkFile("curated/duplicates-decisions.json", "DuplicateDecisionsFile");
  checkFile("curated/advisors.yaml", "AdvisorsFile", yaml);
  checkFile("curated/implementations.yaml", "ImplementationsFile", yaml);
  checkFile("built/incubators.json", "IncubatorsFile");
  checkFile("built/data-version.json", "DataVersion");
  checkFile("built/index-cards.json", "IndexCard[]");
  checkFile("built/index-vectors.json", "IndexVectorsFile", (rel) => {
    const v = json(rel);
    return { ...v, vectors: Object.fromEntries(Object.entries(v.vectors).slice(0, 3)) };
  });
  checkFile("built/places/pl-register.json", "PlacesRegister");
  checkFile("built/map/malopolska-gminy.geojson", "GminaBoundaries");
  checkFile("built/indicators.json", "IndicatorsFile");
  checkFile("built/implementations-derived.json", "ImplementationsDerivedFile");
  checkFile("built/organisations.json", "OrganisationsFile");
  checkFile("built/implementations-merged.json", "ImplementationsMergedFile");
  checkFile("curated/knowledge.yaml", "KnowledgeFile", yaml);
  checkFile("curated/helplines.yaml", "HelplinesFile", yaml);
  if (!paths.length) missing.push("built/paths/");
  for (const f of paths) checkFile(`built/paths/${f}`, "Path", yaml);
  const dir = file("built/innovations");
  const records = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  if (!records.length) missing.push("built/innovations/");
  for (const f of records) checkFile(`built/innovations/${f}`, "BuiltInnovation");

  fs.mkdirSync(CHECK_DIR, { recursive: true });
  fs.writeFileSync(path.join(CHECK_DIR, "check-data.ts"), lines.join("\n") + "\n");
  const tsconfig = {
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      isolatedModules: true,
      skipLibCheck: true,
      types: [],
    },
    files: ["check-data.ts"],
  };
  fs.writeFileSync(path.join(CHECK_DIR, "tsconfig.json"), JSON.stringify(tsconfig, null, 2) + "\n");
  console.log(`checking ${n} data files (${records.length} innovations, ${paths.length} paths) with tsc -p ${path.relative(ROOT, CHECK_DIR)}`);
  if (missing.length) console.log(`not built, not checked: ${missing.join(", ")}`);
  const tsc = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
  try {
    execFileSync(process.execPath, ["--max-old-space-size=4096", tsc, "-p", CHECK_DIR], { cwd: ROOT, stdio: "inherit" });
  } catch {
    process.exit(1);
  }
  console.log("the data files match the types");
}

if (process.argv.includes("--check")) check();
else generate();
