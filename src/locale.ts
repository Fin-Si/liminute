import type { Locale } from "./types";

export function localeFromTags(tags: readonly string[] | null | undefined): Locale {
  if (!tags) return "en";
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t.startsWith("ru")) return "ru";
    if (t.startsWith("zh")) return "zh";
    if (t.startsWith("es")) return "es";
    if (t.startsWith("fr")) return "fr";
    if (t.startsWith("de")) return "de";
    if (t.startsWith("ja")) return "ja";
    if (t.startsWith("pt")) return "pt";
    if (t.startsWith("ko")) return "ko";
    if (t.startsWith("it")) return "it";
    if (t.startsWith("pl")) return "pl";
    if (t.startsWith("nl")) return "nl";
  }
  return "en";
}

export function browserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return localeFromTags(navigator.languages?.length ? navigator.languages : [navigator.language]);
}
