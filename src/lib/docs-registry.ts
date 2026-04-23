export interface DocEntry {
  slug: string;
  fileName: string;
  title: string;
  shortTitle: string;
  docType: string;
  date?: string;
}

export const DOCS: DocEntry[] = [
  { slug: "bylaws", fileName: "siaoa-apartment-bylaws.md", title: "SIAOA Apartment Bylaws", shortTitle: "Bylaws", docType: "bylaws" },
  { slug: "declaration-deed", fileName: "declaration-deed.md", title: "Deed of Declaration", shortTitle: "Declaration Deed", docType: "deed" },
  { slug: "karnataka-ownership-act", fileName: "karnataka-ownership-act.md", title: "Karnataka Apartment Ownership Act 1972", shortTitle: "KA Ownership Act", docType: "act" },
  { slug: "penalties", fileName: "penalties.md", title: "SIAOA Penalties & Violations", shortTitle: "Penalties", docType: "penalties" },
  { slug: "income-expenditure", fileName: "siaoa-income-exp-stmt.md", title: "SIAOA Income & Expenditure Statement", shortTitle: "Income & Expenditure", docType: "financial" },
  { slug: "occupancy-certificate", fileName: "bbmp-occupancy-certificate.md", title: "BBMP Occupancy Certificate", shortTitle: "Occupancy Cert", docType: "certificate" },
  { slug: "completion-certificate", fileName: "completion-certificate.md", title: "Sobha Completion Certificate", shortTitle: "Completion Cert", docType: "certificate" },
  { slug: "mygate-guide", fileName: "mygate-guide.md", title: "MyGate Guide for Sobha Indraprastha", shortTitle: "MyGate Guide", docType: "mygate" },
  { slug: "egm-12-apr-2026", fileName: "egm-12-apr-2026.md", title: "EGM Minutes — 12 April 2026", shortTitle: "EGM Apr 2026", docType: "minutes", date: "2026-04-12" },
  { slug: "mom-8-jul-2025", fileName: "MoM-8-jul-2025.md", title: "Board Meeting — 8 July 2025", shortTitle: "MoM Jul 8", docType: "minutes", date: "2025-07-08" },
  { slug: "mom-22-jul-2025", fileName: "MoM-22-jul-2025.md", title: "Board Meeting — 22 July 2025", shortTitle: "MoM Jul 22", docType: "minutes", date: "2025-07-22" },
  { slug: "mom-25-aug-2025", fileName: "MoM-25-aug-2025.md", title: "Board Meeting — 25 August 2025", shortTitle: "MoM Aug 25", docType: "minutes", date: "2025-08-25" },
  { slug: "mom-4-sep-2025", fileName: "MoM-4-sep-2025.md", title: "Board Meeting — 4 September 2025", shortTitle: "MoM Sep 4", docType: "minutes", date: "2025-09-04" },
  { slug: "mom-8-sep-2025", fileName: "MoM-8-sep-2025.md", title: "Board Meeting — 8 September 2025", shortTitle: "MoM Sep 8", docType: "minutes", date: "2025-09-08" },
  { slug: "mom-23-dec-2025", fileName: "MoM-23-dec-2026.md", title: "Board Meeting — 23 December 2025", shortTitle: "MoM Dec 23", docType: "minutes", date: "2025-12-23" },
  { slug: "mom-10-jan-2026", fileName: "MoM-10-jan-2026.md", title: "Board Meeting — 10 January 2026", shortTitle: "MoM Jan 10", docType: "minutes", date: "2026-01-10" },
  { slug: "mom-3-feb-2026", fileName: "MoM-3-feb-2026.md", title: "Board Meeting — 3 February 2026", shortTitle: "MoM Feb 3", docType: "minutes", date: "2026-02-03" },
  { slug: "mom-3-mar-2026", fileName: "MoM-3-mar-2026.md", title: "Board Meeting — 3 March 2026", shortTitle: "MoM Mar 3", docType: "minutes", date: "2026-03-03" },
  { slug: "mom-31-mar-2026", fileName: "MoM-31-mar-2026.md", title: "Board Meeting — 31 March 2026", shortTitle: "MoM Mar 31", docType: "minutes", date: "2026-03-31" },
];

export function getDocBySlug(slug: string): DocEntry | undefined {
  return DOCS.find((d) => d.slug === slug);
}

export function getDocByName(name: string): DocEntry | undefined {
  const lower = name.toLowerCase();
  return DOCS.find((d) => d.title.toLowerCase() === lower || d.shortTitle.toLowerCase() === lower);
}

export function fuzzyMatchDoc(name: string): DocEntry | undefined {
  const lower = name.toLowerCase();
  return DOCS.find((d) =>
    lower.includes(d.shortTitle.toLowerCase()) ||
    d.title.toLowerCase().includes(lower) ||
    lower.includes(d.title.toLowerCase())
  );
}
