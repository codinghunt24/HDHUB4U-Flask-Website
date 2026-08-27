const INTERNAL_IMPORT_EXCERPT =
  /^Imported listing from \S+\. Review and edit before republishing\.?$/i;

const BLOCKED_IMPORT_TERMS =
  /(?:^|[^a-z0-9])(?:porn(?:ography|ographic)?|sex(?:ual|y)?)(?=$|[^a-z0-9])/i;

export const replaceVisitorTerms = (value: string) =>
  value
    .replace(/\bwatch\b/gi, "See")
    .replace(/\bdownload\b/gi, "Get");

export const containsBlockedImportTerms = (...values: string[]) =>
  values.some((value) => {
    let decodedValue = value;
    try {
      decodedValue = decodeURIComponent(value);
    } catch {
      // Inspect the original value when malformed encoding cannot be decoded.
    }
    return BLOCKED_IMPORT_TERMS.test(decodedValue);
  });

export const buildImportedExcerpt = (title: string) =>
  `Explore ${replaceVisitorTerms(title)} and view its release details and authorized source information.`;

export const cleanImportedExcerpt = (excerpt: string, title: string) => {
  const cleanedExcerpt = INTERNAL_IMPORT_EXCERPT.test(excerpt.trim())
    ? buildImportedExcerpt(title)
    : excerpt;
  return replaceVisitorTerms(cleanedExcerpt);
};