import Link from "next/link";
import Image from "next/image";
import { FileText, Scale, Landmark, ClipboardList, Receipt, ScrollText, Smartphone, ArrowLeft } from "lucide-react";
import { DOCS } from "@/lib/docs-registry";

const ICONS: Record<string, typeof FileText> = {
  bylaws: Scale,
  deed: ScrollText,
  act: Landmark,
  penalties: FileText,
  financial: Receipt,
  certificate: FileText,
  mygate: Smartphone,
  minutes: ClipboardList,
};

const TYPE_LABELS: Record<string, string> = {
  bylaws: "Bylaws & Rules",
  deed: "Legal Documents",
  act: "Government Acts",
  penalties: "Penalties & Violations",
  financial: "Financial Statements",
  certificate: "Certificates",
  mygate: "Resident Guides",
  minutes: "Meeting Minutes",
};

export default function DocsIndex() {
  const grouped = new Map<string, typeof DOCS>();
  for (const doc of DOCS) {
    const group = grouped.get(doc.docType) ?? [];
    group.push(doc);
    grouped.set(doc.docType, group);
  }

  const typeOrder = ["bylaws", "penalties", "mygate", "minutes", "deed", "act", "financial", "certificate"];

  return (
    <div className="min-h-dvh bg-[var(--color-ivory)]">
      <nav className="border-b border-[var(--color-sandstone)] bg-white">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/chat" className="p-1.5 rounded-lg hover:bg-[var(--color-stone-100)] transition-colors">
            <ArrowLeft className="w-4 h-4 text-[var(--color-stone-600)]" />
          </Link>
          <Image src="/sobha-logo.png" alt="Sobha" width={28} height={28} className="rounded-full" />
          <span className="text-[15px] font-semibold text-[var(--color-charcoal)]">Knowledge Base</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-[28px] font-bold text-[var(--color-charcoal)] tracking-[-0.5px] font-[family-name:var(--font-display)]">
          Sobha Indraprastha Documents
        </h1>
        <p className="text-[15px] text-[var(--color-stone-500)] mt-2 mb-10">
          All official documents indexed by Sobha Concierge. Click any document to read the full text.
        </p>

        {typeOrder.map((type) => {
          const docs = grouped.get(type);
          if (!docs) return null;
          const Icon = ICONS[type] ?? FileText;

          return (
            <div key={type} className="mb-8">
              <h2 className="text-[13px] font-semibold text-[var(--color-stone-400)] uppercase tracking-wider mb-3">
                {TYPE_LABELS[type] ?? type}
              </h2>
              <div className="grid gap-2">
                {docs.map((doc) => (
                  <Link
                    key={doc.slug}
                    href={`/docs/${doc.slug}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--color-sandstone)]/60 bg-white hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:border-[var(--color-stone-300)] transition-all"
                  >
                    <Icon className="w-4 h-4 text-[var(--color-emerald)] flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-[var(--color-charcoal)] truncate">
                        {doc.title}
                      </div>
                      {doc.date && (
                        <div className="text-[12px] text-[var(--color-stone-400)]">
                          {new Date(doc.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
