import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { clearPromptCache, loadPrompt, parsePrompt, PromptError } from "@/lib/llm/prompts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

afterEach(() => clearPromptCache());

describe("loadPrompt", () => {
  it("returns the version and the body after the front matter", () => {
    const prompt = loadPrompt("sample", { dir: FIXTURES });
    expect(prompt.version).toBe("sample-v2");
    expect(prompt.body).toBe("# Fixture\n\nZwróć obiekt JSON.");
    expect(prompt.meta.changes).toBe("v2 (second draft): a colon inside a value: kept");
  });

  it("caches per process", () => {
    expect(loadPrompt("sample", { dir: FIXTURES })).toBe(loadPrompt("sample", { dir: FIXTURES }));
  });

  it("reads the real extraction prompt", () => {
    expect(loadPrompt("extract").version).toMatch(/^extract-v\d+$/);
  });

  it("throws a clear error for a missing file", () => {
    expect(() => loadPrompt("nonexistent", { dir: FIXTURES })).toThrow(/prompts\/nonexistent\.md is missing/);
  });

  it("reads CRLF files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-"));
    fs.writeFileSync(path.join(dir, "crlf.md"), "---\r\nversion: crlf-v1\r\n---\r\nTreść.\r\n");
    expect(loadPrompt("crlf", { dir }).body).toBe("Treść.");
  });
});

describe("parsePrompt", () => {
  it("rejects a file without front matter", () => {
    expect(() => parsePrompt("screen", "# no header")).toThrow(PromptError);
  });

  it("rejects a missing version", () => {
    expect(() => parsePrompt("screen", "---\ntask: x\n---\nbody")).toThrow(/no "version" key/);
  });

  it("rejects a version of another task", () => {
    expect(() => parsePrompt("screen", "---\nversion: shortlist-v1\n---\nbody")).toThrow(/screen-v<n>/);
  });

  it("rejects an empty body", () => {
    expect(() => parsePrompt("screen", "---\nversion: screen-v1\n---\n")).toThrow(/empty/);
  });
});
