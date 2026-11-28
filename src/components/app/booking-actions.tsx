"use client";

import { Check, Search, UserCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  assignEmployeeAction,
  availableEmployeesAction,
  confirmBookingAction,
  ignoreBookingAction,
} from "@/app/(app)/_actions/bookings";
import { Avatar, Button, cn, Field, Input, nicePeriod, Select, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/client";

type Free = { id: number; empNo: string; fullName: string; gender: string; phone: string; designation: string; branchId: number; branchName: string };

// ---------------------------------------------------------------- Confirm
export function ConfirmButton({ bookingId, size = "sm" }: { bookingId: number; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="success"
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await confirmBookingAction({ id: bookingId, note: "Confirmed by phone" });
          if (r.ok) {
            toast.success("Booking confirmed");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <Check size={14} /> {pending ? "Saving…" : "Confirm"}
    </Button>
  );
}

// ---------------------------------------------------------------- Ignore (with reason)
const REASONS = ["Customer said not needed", "Could not reach customer", "Customer cancelled", "Booked by mistake", "Other"];

export function IgnoreButton({ bookingId, bookingNo, assigned, size = "sm" }: { bookingId: number; bookingNo: string; assigned?: boolean; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button variant="danger" size={size} onClick={() => setOpen(true)}>
        <X size={14} /> Ignore
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Ignore ${bookingNo}?`}
        subtitle={assigned ? "The assigned employee will be released for that day." : "The customer won't be served for this session."}
      >
        <div className="space-y-4">
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the team should know" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const text = [reason, note.trim()].filter(Boolean).join(" — ").slice(0, 255);
                  const r = await ignoreBookingAction({ id: bookingId, note: text });
                  if (r.ok) {
                    toast.success(`${bookingNo} ignored`);
                    setOpen(false);
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              {pending ? "Saving…" : "Ignore booking"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- Assign / reassign
export function AssignButton({
  bookingId,
  bookingNo,
  serviceDate,
  currentEmployeeId,
  label,
  size = "sm",
  variant = "primary",
}: {
  bookingId: number;
  bookingNo: string;
  serviceDate: string;
  currentEmployeeId?: number | null;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Free[] | null>(null);
  const [period, setPeriod] = useState<string>(serviceDate);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();

  function openDialog() {
    setOpen(true);
    setSelected(null);
    setList(null);
    startLoad(async () => {
      const r = await availableEmployeesAction({ id: bookingId });
      if (r.ok) {
        setList(r.data.employees as Free[]);
        setPeriod(r.data.days > 1 ? `every day ${nicePeriod(r.data.date, r.data.days)} (${r.data.days} days)` : String(r.data.date));
      } else toast.error(r.error);
    });
  }

  const grouped = useMemo(() => {
    const items = (list ?? []).filter(
      (e) =>
        e.id !== currentEmployeeId &&
        (type === "all" || e.designation === type) &&
        (!q || `${e.fullName} ${e.empNo} ${e.branchName}`.toLowerCase().includes(q.toLowerCase())),
    );
    const map = new Map<string, Free[]>();
    for (const e of items) map.set(e.branchName, [...(map.get(e.branchName) ?? []), e]);
    return [...map.entries()];
  }, [list, q, type, currentEmployeeId]);

  return (
    <>
      <Button variant={variant} size={size} onClick={openDialog}>
        <UserCheck size={14} /> {label ?? (currentEmployeeId ? "Change" : "Assign")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`${currentEmployeeId ? "Reassign" : "Assign"} ${bookingNo}`} subtitle={`Free caregivers & nurses on ${period}`} wide>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number or branch" className="pl-9" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
            <option value="all">All types</option>
            <option>Caregiver</option>
            <option>Nurse</option>
          </Select>
        </div>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1 scroll-thin">
          {loading && <p className="py-8 text-center text-sm text-muted">Finding free employees…</p>}
          {!loading && list && grouped.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">No free caregivers or nurses match. Check leave records or try another day.</p>
          )}
          {grouped.map(([branch, emps]) => (
            <div key={branch}>
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
                <span>{branch}</span>
                <span>{emps.length} free</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {emps.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelected(e.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                      selected === e.id ? "border-accent bg-accent-soft/80 shadow-[0_0_0_3px_rgba(102,88,245,0.12)]" : "border-white bg-white/60 hover:bg-white",
                    )}
                  >
                    <Avatar name={e.fullName} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.fullName}</div>
                      <div className="text-xs text-muted">
                        {e.designation} · {e.empNo} · {e.phone}
                      </div>
                    </div>
                    {selected === e.id && <Check size={16} className="text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selected || saving}
            onClick={() =>
              startSave(async () => {
                const r = await assignEmployeeAction({ id: bookingId, employeeId: selected! });
                if (r.ok) {
                  toast.success(`${bookingNo} assigned`);
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {saving ? "Assigning…" : "Assign employee"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
