import { DOCS } from "./docs-registry";

const MATCH_TABLE: [RegExp, string][] = DOCS.map((d) => {
  const words = d.title.replace(/[—–\-]/g, " ").split(/\s+/).filter(w => w.length > 2);
  const pattern = words.slice(0, 3).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return [new RegExp(pattern, "i"), d.slug];
});

export function resolveDocUrl(docName: string, page?: string): string | null {
  const lower = docName.toLowerCase();

  for (const doc of DOCS) {
    if (lower === doc.title.toLowerCase() || lower === doc.shortTitle.toLowerCase()) {
      return buildUrl(doc.slug, page);
    }
  }

  for (const [re, slug] of MATCH_TABLE) {
    if (re.test(docName)) {
      return buildUrl(slug, page);
    }
  }

  if (lower.includes("bylaw")) return buildUrl("bylaws", page);
  if (lower.includes("penalty") || lower.includes("penalties")) return buildUrl("penalties", page);
  if (lower.includes("mygate")) return buildUrl("mygate-guide", page);
  if (lower.includes("deed") || lower.includes("declaration")) return buildUrl("declaration-deed", page);
  if (lower.includes("karnataka") || lower.includes("ownership act")) return buildUrl("karnataka-ownership-act", page);
  if (lower.includes("occupancy")) return buildUrl("occupancy-certificate", page);
  if (lower.includes("completion cert")) return buildUrl("completion-certificate", page);
  if (lower.includes("income") || lower.includes("expenditure")) return buildUrl("income-expenditure", page);

  return null;
}

function buildUrl(slug: string, page?: string): string {
  const pageMatch = page?.match(/page\s*(\d+)/i);
  const anchor = pageMatch ? `#page-${pageMatch[1]}` : "";
  return `/docs/${slug}${anchor}`;
}
