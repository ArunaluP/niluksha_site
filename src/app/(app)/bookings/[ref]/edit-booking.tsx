"use client";

import { BED_MAX, WARD_MAX } from "@/lib/lk-rules";
import { CalendarRange, Pencil } from "lucide-react";
import { DaysStepper } from "@/components/app/days-stepper";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateBookingAction } from "@/app/(app)/_actions/bookings";
import { Button, Field, Input, money, Select, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/client";

type Props = {
  booking: {
    id: number;
    bookingNo: string;
    serviceDate: string;
    days: number;
    rate: string;
    status: string;
    startTime: string;
    packageId: number | null;
    packageName: string | null;
    locationType: "home" | "hospital";
    hospitalId: number | null;
    wardNo: string | null;
    bedNo: string | null;
    serviceAddress: string | null;
    notes: string | null;
  };
  hospitals: { id: number; name: string; city: string | null }[];
  packages: {
    id: number;
    name: string;
    durationHours: number;
    price: string;
  }[];
  today: string;
};

export function EditBookingButton({
  booking,
  hospitals,
  packages,
  today,
}: Props) {
  const [open, setOpen] = useState(false);
  /** Once a caregiver is assigned only the number of days (and notes) can change. */
  const daysOnly = booking.status === "assigned";
  const [f, setF] = useState({
    serviceDate: booking.serviceDate,
    days: booking.days,
    startTime: booking.startTime.slice(0, 5),
    packageId: booking.packageId ? String(booking.packageId) : "",
    locationType: booking.locationType,
    hospitalId: booking.hospitalId ? String(booking.hospitalId) : "",
    wardNo: booking.wardNo ?? "",
    bedNo: booking.bedNo ?? "",
    serviceAddress: booking.serviceAddress ?? "",
    notes: booking.notes ?? "",
  });
  const [err, setErr] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    start(async () => {
      const r = await updateBookingAction(
        daysOnly
          ? { id: booking.id, days: f.days }
          : {
              id: booking.id,
              serviceDate: f.serviceDate,
              days: f.days,
              startTime: f.startTime,
              ...(f.packageId && f.packageId !== String(booking.packageId)
                ? { packageId: Number(f.packageId) }
                : {}),
              locationType: f.locationType,
              hospitalId:
                f.locationType === "hospital"
                  ? f.hospitalId
                    ? Number(f.hospitalId)
                    : null
                  : null,
              wardNo: f.locationType === "hospital" ? f.wardNo : null,
              bedNo: f.locationType === "hospital" ? f.bedNo : null,
              serviceAddress:
                f.locationType === "home" ? f.serviceAddress : null,
              notes: f.notes,
            },
      );
      if (!r.ok) {
        setErr(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success("Booking updated");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {daysOnly ? <CalendarRange size={14} /> : <Pencil size={14} />}{" "}
        {daysOnly ? "Change days" : "Edit"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={
          daysOnly
            ? `Change days · ${booking.bookingNo}`
            : `Edit ${booking.bookingNo}`
        }
        subtitle={
          daysOnly
            ? "The caregiver must be free on every day. Unassign to change other details."
            : "Details can be changed until an employee is assigned; the number of days until it is delivered."
        }
      >
        {daysOnly ? (
          <div className="grid gap-4">
            <DaysStepper
              value={f.days}
              onChange={(days) => setF({ ...f, days })}
              startDate={booking.serviceDate}
              price={booking.rate}
              error={err.days}
            />
            <Field label="Notes" error={err.notes}>
              <Textarea
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Package"
              error={err.packageId}
              className="sm:col-span-2"
              hint="Changing the package also changes the hours and price of this booking."
            >
              <Select
                value={f.packageId}
                onChange={(e) => setF({ ...f, packageId: e.target.value })}
              >
                {/* a package that was made inactive later still shows for this booking */}
                {booking.packageId &&
                  !packages.some((p) => p.id === booking.packageId) && (
                    <option value={String(booking.packageId)}>
                      {booking.packageName} (no longer offered)
                    </option>
                  )}
                {!booking.packageId && <option value="">—</option>}
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.durationHours} h · {money(p.price)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={err.serviceDate}>
              <Input
                type="date"
                min={today}
                value={f.serviceDate}
                onChange={(e) => setF({ ...f, serviceDate: e.target.value })}
              />
            </Field>
            <Field label="Start time" error={err.startTime}>
              <Input
                type="time"
                value={f.startTime}
                onChange={(e) => setF({ ...f, startTime: e.target.value })}
              />
            </Field>
            <DaysStepper
              className="sm:col-span-2"
              value={f.days}
              onChange={(days) => setF({ ...f, days })}
              startDate={f.serviceDate}
              price={
                packages.find((p) => String(p.id) === f.packageId)?.price ??
                booking.rate
              }
              error={err.days}
            />
            <Field label="Location" className="sm:col-span-2">
              <Select
                value={f.locationType}
                onChange={(e) =>
                  setF({
                    ...f,
                    locationType: e.target.value as "home" | "hospital",
                  })
                }
              >
                <option value="home">At home</option>
                <option value="hospital">In a hospital</option>
              </Select>
            </Field>
            {f.locationType === "home" ? (
              <Field
                label="Care address"
                error={err.serviceAddress}
                className="sm:col-span-2"
              >
                <Input
                  value={f.serviceAddress}
                  onChange={(e) =>
                    setF({ ...f, serviceAddress: e.target.value })
                  }
                />
              </Field>
            ) : (
              <>
                <Field
                  label="Hospital"
                  error={err.hospitalId}
                  className="sm:col-span-2"
                >
                  <Select
                    value={f.hospitalId}
                    onChange={(e) => setF({ ...f, hospitalId: e.target.value })}
                  >
                    <option value="">Select hospital</option>
                    {hospitals.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                        {h.city ? ` (${h.city})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Ward no" required error={err.wardNo}>
                  <Input
                    value={f.wardNo}
                    maxLength={WARD_MAX}
                    onChange={(e) => setF({ ...f, wardNo: e.target.value })}
                    placeholder="e.g. 5, 12A, ICU"
                  />
                </Field>
                <Field label="Bed no" error={err.bedNo}>
                  <Input
                    value={f.bedNo}
                    maxLength={BED_MAX}
                    onChange={(e) => setF({ ...f, bedNo: e.target.value })}
                    placeholder="Optional, e.g. 12"
                  />
                </Field>
              </>
            )}
            <Field label="Notes" error={err.notes} className="sm:col-span-2">
              <Textarea
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
              />
            </Field>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
