import { describe, expect, it } from "vitest";
import { parseEnvFile, resolveEnv } from "@/lib/env";

describe("parseEnvFile", () => {
  it("reads KEY=VALUE lines with comments, quotes, export and CRLF", () => {
    const text = "﻿# comment\r\nHF_TOKEN=abc=def\r\nexport LLM_PROVIDER=anthropic\n" + "QUOTED=\"a b # c\"\nSINGLE='x'\nTRAIL=value # note\n\nNOEQUALS\n=nokey\n";
    expect(parseEnvFile(text)).toEqual({
      HF_TOKEN: "abc=def",
      LLM_PROVIDER: "anthropic",
      QUOTED: "a b # c",
      SINGLE: "x",
      TRAIL: "value",
    });
  });
});

describe("resolveEnv", () => {
  it("prefers a value already set in the environment", () => {
    expect(resolveEnv("A", { A: "env" }, { A: "file" })).toBe("env");
  });

  it("falls back to the file when the variable is missing or empty", () => {
    expect(resolveEnv("A", {}, { A: "file" })).toBe("file");
    expect(resolveEnv("A", { A: "" }, { A: "file" })).toBe("file");
  });

  it("returns undefined when set nowhere", () => {
    expect(resolveEnv("A", {}, { A: "" })).toBeUndefined();
  });
});
