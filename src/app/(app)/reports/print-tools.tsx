"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * Print button. With `href` (the ?print=1 page that loads every event) it opens
 * that page in a new tab, which prints itself; without, it prints this page.
 */
export function PrintButton({ href, label = "Print" }: { href?: string; label?: string }) {
  return (
    <Button variant="secondary" onClick={() => (href ? window.open(href, "_blank") : window.print())}>
      <Printer size={16} /> {label}
    </Button>
  );
}

/** On the ?print=1 page: opens the print dialog once the report has rendered. */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t); // React dev double-mount: only the second timer survives
  }, []);
  return null;
}
