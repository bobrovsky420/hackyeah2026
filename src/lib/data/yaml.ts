import YAML from "yaml";

/*
 * The YAML files of the repository (the hand-written files of data/, the
 * safety lists, the test problems) are read with the `yaml` package in its
 * YAML 1.2 core schema: plain dates stay strings, only true and false are
 * booleans, a duplicate key is an error. Errors name the file and the line.
 */

export type YamlValue = null | boolean | number | string | YamlValue[] | { [key: string]: YamlValue };

export class YamlError extends Error {}

/** The document of one YAML file, or YamlError as `<file>:<line>: <message>`. */
export function parseYaml(source: string, file = "<yaml>"): YamlValue {
  try {
    return (YAML.parse(source, { prettyErrors: false }) ?? null) as YamlValue;
  } catch (error) {
    const offset = (error as { pos?: [number, number] }).pos?.[0] ?? 0;
    const line = source.slice(0, offset).split("\n").length;
    throw new YamlError(`${file}:${line}: ${(error as Error).message}`);
  }
}
