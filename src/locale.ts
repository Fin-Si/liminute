import type { Locale } from "./types";

export function localeFromTags(tags: readonly string[] | null | undefined): Locale {
  return tags?.some((tag) => tag.toLowerCase().startsWith("ru")) ? "ru" : "en";
}

export function browserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return localeFromTags(navigator.languages?.length ? navigator.languages : [navigator.language]);
}
