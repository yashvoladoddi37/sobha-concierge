"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  MessageSquareText,
  Search,
  ShieldCheck,
  FileText,
  ArrowRight,
  Sparkles,
  Scale,
  Users,
  IndianRupee,
} from "lucide-react";

function useIntersectionReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    const targets = el.querySelectorAll(".reveal-on-scroll");
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);
  return ref;
}

export default function LandingPage() {
  const featuresRef = useIntersectionReveal();
  const capabilitiesRef = useIntersectionReveal();
  const ctaRef = useIntersectionReveal();

  return (
    <div className="min-h-dvh bg-[var(--color-ivory)]">
      {/* ── Nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[var(--color-ivory)]/85 backdrop-blur-xl border-b border-[var(--color-sandstone)]/60">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/sobha-logo.png" alt="Sobha" width={32} height={32} className="rounded-lg" />
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-charcoal)]">
              Sobha Concierge
            </span>
          </div>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-emerald)] text-white text-[13px] font-medium transition-all hover:bg-[var(--color-emerald-dark)] hover:shadow-[0_0_0_3px_rgba(45,106,79,0.15)]"
          >
            Open Chat
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-gold-border)] bg-[var(--color-gold-light)] mb-8 hero-fade-in" style={{ animationDelay: "0ms" }}>
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-gold)]" />
            <span className="text-[12px] font-medium text-[var(--color-gold)] tracking-wide uppercase">
              AI-Powered Resident Assistant
            </span>
          </div>

          <h1 className="text-[clamp(36px,6vw,56px)] font-light tracking-[-0.03em] leading-[1.08] text-[var(--color-charcoal)] font-[family-name:var(--font-display)] hero-fade-in" style={{ animationDelay: "80ms" }}>
            Every answer about<br />
            <span className="font-semibold text-[var(--color-emerald)] whitespace-nowrap">
              Sobha Indraprastha
            </span>
            {" "}at your fingertips
          </h1>

          <p className="mt-6 text-[17px] leading-relaxed text-[var(--color-stone-500)] max-w-xl mx-auto hero-fade-in" style={{ animationDelay: "160ms" }}>
            Bylaws, meeting decisions, penalties, maintenance rules — stop
            scrolling through WhatsApp groups. Ask Sobha Concierge and get instant,
            cited answers from official documents.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center hero-fade-in" style={{ animationDelay: "240ms" }}>
            <Link
              href="/chat"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[var(--color-emerald)] text-white text-[15px] font-medium transition-all hover:bg-[var(--color-emerald-dark)] hover:shadow-[0_4px_20px_rgba(45,106,79,0.25)]"
            >
              <MessageSquareText className="w-4.5 h-4.5" />
              Start a Conversation
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-[var(--color-sandstone)] text-[var(--color-stone-700)] text-[15px] font-medium transition-all hover:bg-white hover:border-[var(--color-stone-300)]"
            >
              See How It Works
            </a>
          </div>
        </div>

        {/* Chat Preview */}
        <div className="mt-16 max-w-lg mx-auto hero-fade-in" style={{ animationDelay: "350ms" }}>
          <div className="rounded-2xl border border-[var(--color-sandstone)] bg-white shadow-[0_30px_60px_-30px_rgba(28,25,23,0.12),0_0_0_1px_rgba(28,25,23,0.03)] overflow-hidden">
            {/* Mock header */}
            <div className="h-12 border-b border-[var(--color-sandstone)]/60 flex items-center gap-2.5 px-4 bg-[var(--color-stone-100)]/50">
              <Image src="/sobha-logo.png" alt="Sobha" width={24} height={24} className="rounded-full" />
              <span className="text-[13px] font-medium text-[var(--color-charcoal)]">Sobha Concierge</span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span className="text-[11px] text-[var(--color-stone-400)]">Online</span>
              </span>
            </div>
            {/* Mock messages */}
            <div className="p-4 space-y-3">
              <div className="flex justify-end">
                <div className="bg-[var(--color-charcoal)] text-white text-[14px] px-4 py-2.5 rounded-[16px_16px_2px_16px] max-w-[80%]">
                  What&apos;s the penalty for late maintenance payment?
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-[var(--color-emerald-light)] text-[var(--color-charcoal)] text-[14px] px-4 py-2.5 rounded-[2px_16px_16px_16px] max-w-[85%] space-y-2">
                  <p>
                    As per <strong>Clause 36(a)</strong> of the SIAOA Bylaws, a late fee of{" "}
                    <strong>18% per annum</strong> is charged on overdue maintenance amounts.
                  </p>
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-gold-light)] border border-[var(--color-gold-border)]">
                    <FileText className="w-3 h-3 text-[var(--color-gold)]" />
                    <span className="text-[11px] font-medium text-[var(--color-gold)]">
                      SIAOA Bylaws, Pg 12
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" ref={featuresRef} className="py-24 px-6 bg-white border-y border-[var(--color-sandstone)]/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-[clamp(24px,4vw,36px)] font-light tracking-[-0.02em] text-[var(--color-charcoal)] font-[family-name:var(--font-display)] reveal-on-scroll">
              Built for <span className="font-semibold">residents</span>, powered by{" "}
              <span className="font-semibold text-[var(--color-emerald)]">official documents</span>
            </h2>
            <p className="mt-4 text-[15px] text-[var(--color-stone-500)] max-w-lg mx-auto reveal-on-scroll">
              Sobha Concierge reads every bylaw, meeting minute, and official notice — so you don&apos;t have to.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Search,
                title: "Hybrid Search",
                desc: "Combines semantic understanding with keyword matching to find exactly the right clause or decision.",
              },
              {
                icon: ShieldCheck,
                title: "Cited Answers",
                desc: "Every response references the exact document, clause, and page number. No hallucinations.",
              },
              {
                icon: FileText,
                title: "172 Pages Indexed",
                desc: "Bylaws, deed of declaration, meeting minutes, Karnataka Act, penalty schedules — all searchable.",
              },
              {
                icon: Scale,
                title: "Legal Precision",
                desc: "Quotes exact fine amounts, clause numbers, and meeting dates. Built for governance questions.",
              },
              {
                icon: Users,
                title: "Community Memory",
                desc: "Knows what was decided in every AGM and committee meeting. Your association's institutional memory.",
              },
              {
                icon: IndianRupee,
                title: "Free for Residents",
                desc: "Runs entirely on free-tier APIs. No subscription, no hidden costs. Built as a community tool.",
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className="reveal-on-scroll group p-6 rounded-xl border border-[var(--color-sandstone)]/60 bg-[var(--color-ivory)]/50 transition-all hover:shadow-[rgba(50,50,93,0.12)_0px_20px_40px_-20px,rgba(0,0,0,0.06)_0px_12px_24px_-12px] hover:border-[var(--color-stone-300)]"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--color-emerald-light)] flex items-center justify-center mb-4 group-hover:bg-[var(--color-emerald)] transition-colors">
                  <Icon className="w-5 h-5 text-[var(--color-emerald)] group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-[15px] font-semibold text-[var(--color-charcoal)] mb-1.5">
                  {title}
                </h3>
                <p className="text-[13px] leading-relaxed text-[var(--color-stone-500)]">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section ref={capabilitiesRef} className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-center text-[clamp(24px,4vw,36px)] font-light tracking-[-0.02em] text-[var(--color-charcoal)] font-[family-name:var(--font-display)] mb-16 reveal-on-scroll">
            How <span className="font-semibold text-[var(--color-emerald)]">Sobha Concierge</span> finds your answer
          </h2>

          <div className="space-y-0">
            {[
              {
                step: "01",
                title: "You ask a question",
                desc: "In plain language. \"Can I sublet my flat?\" or \"What was the parking decision in the March AGM?\"",
              },
              {
                step: "02",
                title: "Hybrid search retrieves context",
                desc: "Your question is matched against 172 pages using both semantic similarity and keyword search, then reranked for precision.",
              },
              {
                step: "03",
                title: "AI generates a cited answer",
                desc: "Gemini reads the relevant clauses and drafts a response with exact references — document name, clause number, page.",
              },
            ].map(({ step, title, desc }, i) => (
              <div
                key={step}
                className="reveal-on-scroll flex gap-6 py-8 border-b border-[var(--color-sandstone)]/60 last:border-0"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-[var(--color-emerald)] flex items-center justify-center">
                  <span className="text-[13px] font-semibold text-[var(--color-emerald)]">
                    {step}
                  </span>
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-[var(--color-charcoal)] mb-1">
                    {title}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-[var(--color-stone-500)]">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={ctaRef} className="py-24 px-6 bg-[var(--color-charcoal)]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-[clamp(24px,4vw,36px)] font-light tracking-[-0.02em] text-white font-[family-name:var(--font-display)] mb-4 reveal-on-scroll">
            Stop guessing. <span className="font-semibold">Start asking.</span>
          </h2>
          <p className="text-[15px] text-[var(--color-stone-400)] mb-10 reveal-on-scroll">
            Your apartment&apos;s bylaws, decisions, and rules — all in one conversation.
          </p>
          <Link
            href="/chat"
            className="reveal-on-scroll inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-[var(--color-emerald)] text-white text-[15px] font-medium transition-all hover:bg-[var(--color-emerald-dark)] hover:shadow-[0_0_0_3px_rgba(45,106,79,0.3),0_8px_24px_rgba(45,106,79,0.3)]"
          >
            <MessageSquareText className="w-5 h-5" />
            Open Sobha Concierge
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-6 border-t border-[var(--color-sandstone)]/40">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/sobha-logo.png" alt="Sobha" width={24} height={24} className="rounded-md" />
            <span className="text-[13px] font-medium text-[var(--color-stone-500)]">
              Sobha Concierge
            </span>
          </div>
          <p className="text-[12px] text-[var(--color-stone-400)]">
            Built with care for the residents of Sobha Indraprastha, Rajajinagar
          </p>
        </div>
      </footer>
    </div>
  );
}
