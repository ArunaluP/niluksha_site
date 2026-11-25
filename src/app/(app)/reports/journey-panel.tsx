"use client";

import { ArrowRight, Lock, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { BookingJourney, BookingJourneySkeleton } from "@/components/app/booking-journey";
import { Button, buttonClass, cn } from "@/components/ui";
import type { BookingJourney as Journey } from "@/features/bookings/journey";

/**
 * Reports → click a row → the booking's journey slides in from the right.
 * The open booking lives in the URL (?view=BK-2026-00018): Back closes it, the link
 * can be shared. The native History API keeps useSearchParams in sync without
 * re-running the report on the server.
 */

const BOOKING_NO = /^BK-\d{4}-\d{5}$/i;

// Opened by a click on this page (→ closing = history.back()), vs. a shared link (→ replace).
let openedHere = false;
let returnFocus: HTMLElement | null = null;

function urlWith(view: string | null) {
  const url = new URL(window.location.href);
  if (view) url.searchParams.set("view", view);
  else url.searchParams.delete("view");
  return `${url.pathname}${url.search}${url.hash}`;
}

function openJourney(bookingNo: string, from: HTMLElement) {
  returnFocus = from;
  openedHere = true;
  window.history.pushState(null, "", urlWith(bookingNo));
}

function closeJourney() {
  if (openedHere) {
    openedHere = false;
    window.history.back();
  } else {
    window.history.replaceState(null, "", urlWith(null));
  }
}

/** A report row that opens the journey panel (click, Enter or Space). Links inside keep working. */
export function JourneyRow({ bookingNo, className, children }: { bookingNo: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest("a, button, input, select")) return;
    if (window.getSelection()?.toString()) return; // selecting text, not clicking
    openJourney(bookingNo, e.currentTarget);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openJourney(bookingNo, e.currentTarget);
    }
  };
  return (
    <tr
      data-journey-row={bookingNo}
      role="button"
      tabIndex={0}
      aria-label={`Show the journey of booking ${bookingNo}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "cursor-pointer outline-none hover:bg-white/60 focus-visible:bg-white/70 focus-visible:shadow-[inset_3px_0_0_var(--color-accent)] print:cursor-auto",
        className,
      )}
    >
      {children}
    </tr>
  );
}

type Load = { state: "loading" } | { state: "ok"; data: Journey } | { state: "denied" } | { state: "error"; message: string };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The slide-over. Render once on the Reports page (inside <Suspense>). */
export function JourneyPanel() {
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get("view");
  const view = raw && BOOKING_NO.test(raw) ? raw.toUpperCase() : null;
  const lastView = useRef<string | null>(null);

  // On close, give focus back to the row that opened it.
  useEffect(() => {
    if (view) {
      lastView.current = view;
      return;
    }
    const closed = lastView.current;
    if (!closed) return;
    lastView.current = null;
    const row = returnFocus?.isConnected ? returnFocus : document.querySelector<HTMLElement>(`[data-journey-row="${closed}"]`);
    row?.focus();
    returnFocus = null;
  }, [view]);

  if (!view) return null;

  // "Open full page" → back to this report (same filters + page), without ?view=.
  const back = new URLSearchParams(params.toString());
  back.delete("view");
  const backQs = back.toString();
  const backUrl = `${pathname}${backQs ? `?${backQs}` : ""}`;

  // key: a fresh panel (loading state, slide-in) for each booking.
  return <Panel key={view} view={view} fullHref={`/bookings/${view}?from=reports&back=${encodeURIComponent(backUrl)}`} />;
}

function Panel({ view, fullHref }: { view: string; fullHref: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch the journey.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/bookings/${encodeURIComponent(view)}/journey`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (res.status === 404) setLoad({ state: "denied" });
        else if (!res.ok || !json?.ok) setLoad({ state: "error", message: json?.error ?? `Could not load the booking (${res.status}).` });
        else setLoad({ state: "ok", data: json.data });
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setLoad({ state: "error", message: "Could not load the booking. Check your connection." });
      });
    return () => ctrl.abort();
  }, [view]);

  // Slide in, lock page scroll, focus the panel.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Esc closes; Tab stays inside the panel.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeJourney();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="no-print fixed inset-0 z-50" role="presentation">
      <div
        className={cn("absolute inset-0 bg-indigo-950/25 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none", shown ? "opacity-100" : "opacity-0")}
        onClick={closeJourney}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Booking ${view} journey`}
        tabIndex={-1}
        className={cn(
          "glass-strong absolute inset-y-0 right-0 flex w-full flex-col rounded-none outline-none sm:w-[460px] sm:rounded-l-3xl",
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-indigo-100/70 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Booking journey</span>
          <button type="button" onClick={closeJourney} className="rounded-lg p-1.5 text-muted hover:bg-white/70 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
          {load.state === "loading" && <BookingJourneySkeleton />}
          {load.state === "ok" && <BookingJourney journey={load.data} variant="panel" />}
          {load.state === "denied" && (
            <div className="flex flex-col items-center px-4 py-16 text-center">
              <div className="mb-3 rounded-2xl bg-accent-soft p-3 text-accent">
                <Lock size={22} />
              </div>
              <p className="font-medium text-ink">You don&apos;t have access to this booking</p>
              <p className="mt-1 text-sm text-muted">It may belong to another branch, or it doesn&apos;t exist.</p>
            </div>
          )}
          {load.state === "error" && <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">{load.message}</div>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-indigo-100/70 px-5 py-3">
          <Button type="button" variant="ghost" onClick={closeJourney}>
            Close
          </Button>
          {load.state !== "denied" && (
            <Link href={fullHref} className={buttonClass("primary")}>
              Open full page <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
