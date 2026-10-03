/*
 * A parser for the YAML subset of the hand-written files in data/
 * (advisors, implementations, knowledge, helplines, paths/*.yaml), so the
 * loader needs no YAML dependency. Supported: comments, block mappings,
 * block sequences (of scalars and of mappings), flow sequences of scalars,
 * double- and single-quoted and plain scalars (null, true, false, numbers,
 * strings). Anything else (block scalars | and >, flow mappings, anchors,
 * multi-line scalars) throws with the file and line, so a new construct
 * fails loudly instead of being misread. Plain dates stay strings.
 */

export type YamlValue = null | boolean | number | string | YamlValue[] | { [key: string]: YamlValue };

interface Line {
  no: number;
  indent: number;
  text: string;
}

export class YamlSubsetError extends Error {}

export function parseYamlSubset(source: string, file = "<yaml>"): YamlValue {
  const lines: Line[] = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    if (raw.includes("\t")) fail(file, index + 1, "tab in indentation or value");
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed === "---") return;
    lines.push({ no: index + 1, indent: raw.length - raw.trimStart().length, text: raw.trimEnd().trimStart() });
  });
  if (lines.length === 0) return null;
  const [value, next] = parseBlock(lines, 0, lines[0].indent, file);
  if (next < lines.length) fail(file, lines[next].no, "unexpected indentation");
  return value;
}

function fail(file: string, line: number, message: string): never {
  throw new YamlSubsetError(`${file}:${line}: ${message} (not in the YAML subset of src/lib/data/yaml.ts)`);
}

const isSequenceItem = (text: string) => text === "-" || text.startsWith("- ");

/** `key: rest` with a plain or quoted key; null when the text is not a mapping entry. */
function splitKey(text: string): { key: string; rest: string } | null {
  const match = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#\-[{][^#]*?|-[^\s][^#]*?)\s*:(?:\s+(.*))?$/.exec(text);
  if (!match) return null;
  const rawKey = match[1];
  const key = rawKey.startsWith('"') ? (JSON.parse(rawKey) as string) : rawKey.startsWith("'") ? rawKey.slice(1, -1).replace(/''/g, "'") : rawKey;
  return { key, rest: (match[2] ?? "").trim() };
}

function parseBlock(lines: Line[], i: number, indent: number, file: string): [YamlValue, number] {
  return isSequenceItem(lines[i].text) ? parseSequence(lines, i, indent, file) : parseMapping(lines, i, indent, file);
}

function parseSequence(lines: Line[], i: number, indent: number, file: string): [YamlValue[], number] {
  const items: YamlValue[] = [];
  while (i < lines.length && lines[i].indent === indent && isSequenceItem(lines[i].text)) {
    const line = lines[i];
    const rest = line.text.slice(1).trimStart();
    if (rest === "" || rest.startsWith("#")) {
      const next = lines[i + 1];
      if (!next || next.indent <= indent) {
        items.push(null);
        i += 1;
      } else {
        const [value, after] = parseBlock(lines, i + 1, next.indent, file);
        items.push(value);
        i = after;
      }
    } else if (splitKey(rest) && !/^["'[]/.test(rest)) {
      // "- key: value" opens a mapping whose keys sit under the first key.
      const inner = indent + (line.text.length - rest.length);
      const patched = [...lines];
      patched[i] = { no: line.no, indent: inner, text: rest };
      const [value, after] = parseMapping(patched, i, inner, file);
      items.push(value);
      i = after;
    } else {
      items.push(parseScalarOrFlow(rest, file, line.no));
      i += 1;
      if (i < lines.length && lines[i].indent > indent) fail(file, lines[i].no, "continuation of a sequence scalar");
    }
  }
  return [items, i];
}

function parseMapping(lines: Line[], i: number, indent: number, file: string): [{ [key: string]: YamlValue }, number] {
  const result: { [key: string]: YamlValue } = {};
  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i];
    if (isSequenceItem(line.text)) fail(file, line.no, "sequence item where a mapping key was expected");
    const entry = splitKey(line.text);
    if (!entry) fail(file, line.no, "expected `key: value`");
    if (Object.hasOwn(result, entry.key)) fail(file, line.no, `duplicate key ${entry.key}`);
    const next = lines[i + 1];
    if (entry.rest === "" || entry.rest.startsWith("#")) {
      if (next && next.indent > indent) {
        [result[entry.key], i] = parseBlock(lines, i + 1, next.indent, file);
      } else if (next && next.indent === indent && isSequenceItem(next.text)) {
        [result[entry.key], i] = parseSequence(lines, i + 1, indent, file);
      } else {
        result[entry.key] = null;
        i += 1;
      }
    } else {
      result[entry.key] = parseScalarOrFlow(entry.rest, file, line.no);
      i += 1;
      if (next && next.indent > indent) fail(file, next.no, "continuation of a multi-line scalar");
    }
  }
  return [result, i];
}

function parseScalarOrFlow(text: string, file: string, no: number): YamlValue {
  if (text.startsWith("{")) fail(file, no, "flow mapping");
  if (/^[|>]/.test(text)) fail(file, no, "block scalar");
  if (/^[&*!]/.test(text)) fail(file, no, "anchor, alias or tag");
  if (!text.startsWith("[")) {
    const [value, rest] = readScalar(text, file, no);
    if (rest.trim() !== "" && !rest.trim().startsWith("#")) fail(file, no, "text after a quoted scalar");
    return value;
  }
  const items: YamlValue[] = [];
  let rest = text.slice(1).trimStart();
  if (rest.startsWith("]")) return checkEnd(items, rest.slice(1), file, no);
  for (;;) {
    let value: YamlValue;
    if (rest.startsWith('"') || rest.startsWith("'")) {
      [value, rest] = readScalar(rest, file, no);
    } else {
      const end = rest.search(/[,\]]/);
      if (end < 0) fail(file, no, "unclosed flow sequence");
      value = plainScalar(rest.slice(0, end).trim());
      rest = rest.slice(end);
    }
    items.push(value);
    rest = rest.trimStart();
    if (rest.startsWith(",")) rest = rest.slice(1).trimStart();
    else if (rest.startsWith("]")) return checkEnd(items, rest.slice(1), file, no);
    else fail(file, no, "malformed flow sequence");
  }
}

function checkEnd(items: YamlValue[], rest: string, file: string, no: number): YamlValue[] {
  if (rest.trim() !== "" && !rest.trim().startsWith("#")) fail(file, no, "text after a flow sequence");
  return items;
}

/** One scalar at the start of `text`; returns it and the unread remainder. */
function readScalar(text: string, file: string, no: number): [YamlValue, string] {
  if (text.startsWith('"')) {
    const match = /^"(?:[^"\\]|\\.)*"/.exec(text);
    if (!match) fail(file, no, "unclosed double-quoted scalar");
    return [JSON.parse(match[0]) as string, text.slice(match[0].length)];
  }
  if (text.startsWith("'")) {
    const match = /^'(?:[^']|'')*'/.exec(text);
    if (!match) fail(file, no, "unclosed single-quoted scalar");
    return [match[0].slice(1, -1).replace(/''/g, "'"), text.slice(match[0].length)];
  }
  const comment = text.search(/\s#/);
  return [plainScalar((comment < 0 ? text : text.slice(0, comment)).trim()), ""];
}

function plainScalar(text: string): YamlValue {
  if (text === "null" || text === "~" || text === "") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(text)) return Number(text);
  return text;
}
