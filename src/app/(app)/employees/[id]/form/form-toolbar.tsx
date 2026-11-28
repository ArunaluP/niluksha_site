"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { Button, cn } from "@/components/ui";

/** Back link, English / Sinhala switch and Print. */
export function FormToolbar({ id, name, lang }: { id: number; name: string; lang: "en" | "si" }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href={`/employees/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> {name}
      </Link>
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl border border-white/80 bg-white/60 p-0.5 text-[13px]">
          {(
            [
              ["en", "English", `/employees/${id}/form`],
              ["si", "සිංහල", `/employees/${id}/form?lang=si`],
            ] as const
          ).map(([l, label, href]) => (
            <Link
              key={l}
              href={href}
              replace
              className={cn("rounded-lg px-3 py-1.5 font-medium transition", lang === l ? "bg-accent-soft text-accent" : "text-muted hover:text-ink")}
            >
              {label}
            </Link>
          ))}
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save PDF
        </Button>
      </div>
    </div>
  );
}
