import { t, type MessageKey } from "@/lib/i18n";

/** The kinds of a knowledge item (knowledge.yaml, and "video" for the panel's items) as interface strings. */
const keys: Record<string, MessageKey> = {
  guide: "admin.knowledgeType.guide",
  model: "admin.knowledgeType.model",
  publication: "admin.knowledgeType.publication",
  catalogue: "admin.knowledgeType.catalogue",
  data: "admin.knowledgeType.data",
  contact: "admin.knowledgeType.contact",
  project: "admin.knowledgeType.project",
  video: "admin.knowledgeType.video",
};

export const knowledgeTypeCodes = Object.keys(keys);

export function knowledgeTypeLabel(code: string): string {
  return keys[code] ? t(keys[code]) : code;
}
