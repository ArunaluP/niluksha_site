"use client";

import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";
import { Button, cn, type ButtonVariant } from "./index";

// ---------------------------------------------------------------- Dialog
/** A centred glass modal. Controlled with `open` / `onClose`. */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "glass-strong m-auto w-[calc(100%-2rem)] p-0 text-ink backdrop:bg-indigo-950/20 backdrop:backdrop-blur-[3px]",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto scroll-thin">
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div>
              <h3 className="text-lg font-semibold">{title}</h3>
              {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/70 hover:text-ink" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="px-6 pb-6">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------- Action button
/**
 * Runs a server action (made with protectedAction) on click,
 * shows a toast with the result and refreshes the page data.
 */
export function ActionButton<I, R>({
  action,
  input,
  children,
  variant = "secondary",
  size = "sm",
  confirm,
  success,
  onDone,
  className,
  disabled,
}: {
  action: (input: I) => Promise<ActionResult<R>>;
  input: I;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  confirm?: string;
  success?: string;
  onDone?: (data: R) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const res = await action(input);
          if (res.ok) {
            if (success) toast.success(success);
            onDone?.(res.data);
            router.refresh();
          } else {
            toast.error(res.error);
          }
        });
      }}
    >
      {pending ? "Working…" : children}
    </Button>
  );
}

// ---------------------------------------------------------------- Nav link
export function NavLink({ href, icon, children, exact }: { href: string; icon: ReactNode; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition",
        active ? "bg-accent-soft/90 text-accent shadow-[inset_0_0_0_1px_rgba(102,88,245,0.12)]" : "text-ink/70 hover:bg-white/60 hover:text-ink",
      )}
    >
      <span className={active ? "text-accent" : "text-muted"}>{icon}</span>
      {children}
    </Link>
  );
}
