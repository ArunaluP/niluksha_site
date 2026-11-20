import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Joins class names, skipping empty ones. */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- Card
export function Card({ className, children, strong }: { className?: string; children: ReactNode; strong?: boolean }) {
  return <div className={cn(strong ? "glass-strong" : "glass", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Buttons
const buttonVariants = {
  primary:
    "text-white bg-gradient-to-r from-[#6658f5] to-[#8b5cf6] shadow-[0_8px_20px_-8px_rgba(102,88,245,0.7)] hover:brightness-105",
  secondary: "text-ink bg-white/75 border border-white hover:bg-white shadow-sm",
  ghost: "text-muted hover:text-ink hover:bg-white/60",
  danger: "text-rose-700 bg-rose-50/90 border border-rose-100 hover:bg-rose-100",
  success: "text-emerald-700 bg-emerald-50/90 border border-emerald-100 hover:bg-emerald-100",
} as const;
const buttonSizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-11 px-6 text-sm" } as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary", size: keyof typeof buttonSizes = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ---------------------------------------------------------------- Form fields
export function Field({
  label,
  error,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  error?: string | string[];
  hint?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-ink/80">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {msg ? <span className="block text-xs text-rose-600">{msg}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("field", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn("field appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b6b8d%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_0.85rem_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn("field min-h-[84px] resize-y", className)} {...props} />;
}

// ---------------------------------------------------------------- Badges
const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-100/80 text-amber-800 border-amber-200" },
  confirmed: { label: "Confirmed", cls: "bg-sky-100/80 text-sky-800 border-sky-200" },
  assigned: { label: "Assigned", cls: "bg-violet-100/80 text-violet-800 border-violet-200" },
  delivered: { label: "Delivered", cls: "bg-emerald-100/80 text-emerald-800 border-emerald-200" },
  invoice_printed: { label: "Invoice printed", cls: "bg-slate-100/90 text-slate-700 border-slate-200" },
  ignored: { label: "Ignored", cls: "bg-rose-100/80 text-rose-700 border-rose-200" },
  generated: { label: "Waiting to print", cls: "bg-amber-100/80 text-amber-800 border-amber-200" },
  printed: { label: "Printed", cls: "bg-emerald-100/80 text-emerald-800 border-emerald-200" },
  active: { label: "Active", cls: "bg-emerald-100/80 text-emerald-800 border-emerald-200" },
  inactive: { label: "Inactive", cls: "bg-slate-100/90 text-slate-600 border-slate-200" },
};

export const STATUS_DOT: Record<string, string> = {
  pending: "bg-amber-400",
  confirmed: "bg-sky-400",
  assigned: "bg-violet-500",
  delivered: "bg-emerald-500",
  invoice_printed: "bg-slate-400",
  ignored: "bg-rose-400",
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return <span className={cn("inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold", s.cls)}>{s.label}</span>;
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-lg bg-white/70 px-2 py-0.5 text-[11px] font-medium text-muted border border-white", className)}>{children}</span>;
}

// ---------------------------------------------------------------- Avatar
const AVATAR_COLORS = ["bg-indigo-500", "bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white/80",
        color,
        size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs",
      )}
    >
      {initials || "?"}
    </span>
  );
}

// ---------------------------------------------------------------- Page header
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Table
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto scroll-thin", className)}>
      <table className="w-full border-separate border-spacing-0 text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn("border-b border-indigo-100/70 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted", className)}>
      {children}
    </th>
  );
}
export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-indigo-100/50 px-4 py-3 align-middle", className)}>
      {children}
    </td>
  );
}

// ---------------------------------------------------------------- Empty state
export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-2xl bg-accent-soft p-3 text-accent">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Formatting helpers
export function money(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  return `Rs. ${n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function niceDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function niceTime(t: string | null | undefined) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function niceDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Colombo",
  });
}
