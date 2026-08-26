const INTERNAL_IMPORT_EXCERPT =
  /^Imported listing from \S+\. Review and edit before republishing\.?$/i;

export const buildImportedExcerpt = (title: string) =>
  `Explore ${title} and view its release details and authorized source information.`;

export const cleanImportedExcerpt = (excerpt: string, title: string) =>
  INTERNAL_IMPORT_EXCERPT.test(excerpt.trim())
    ? buildImportedExcerpt(title)
    : excerpt;