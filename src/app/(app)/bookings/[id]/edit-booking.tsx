"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateBookingAction } from "@/app/(app)/_actions/bookings";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/client";

type Props = {
  booking: {
    id: number;
    bookingNo: string;
    serviceDate: string;
    startTime: string;
    locationType: "home" | "hospital";
    hospitalId: number | null;
    wardRoom: string | null;
    serviceAddress: string | null;
    notes: string | null;
  };
  hospitals: { id: number; name: string; city: string | null }[];
  today: string;
};

export function EditBookingButton({ booking, hospitals, today }: Props) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    serviceDate: booking.serviceDate,
    startTime: booking.startTime.slice(0, 5),
    locationType: booking.locationType,
    hospitalId: booking.hospitalId ? String(booking.hospitalId) : "",
    wardRoom: booking.wardRoom ?? "",
    serviceAddress: booking.serviceAddress ?? "",
    notes: booking.notes ?? "",
  });
  const [err, setErr] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    start(async () => {
      const r = await updateBookingAction({
        id: booking.id,
        serviceDate: f.serviceDate,
        startTime: f.startTime,
        locationType: f.locationType,
        hospitalId: f.locationType === "hospital" ? (f.hospitalId ? Number(f.hospitalId) : null) : null,
        wardRoom: f.locationType === "hospital" ? f.wardRoom : null,
        serviceAddress: f.locationType === "home" ? f.serviceAddress : null,
        notes: f.notes,
      });
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
        <Pencil size={14} /> Edit
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Edit ${booking.bookingNo}`} subtitle="Details can be changed until an employee is assigned.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" error={err.serviceDate}>
            <Input type="date" min={today} value={f.serviceDate} onChange={(e) => setF({ ...f, serviceDate: e.target.value })} />
          </Field>
          <Field label="Start time" error={err.startTime}>
            <Input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          </Field>
          <Field label="Location" className="sm:col-span-2">
            <Select value={f.locationType} onChange={(e) => setF({ ...f, locationType: e.target.value as "home" | "hospital" })}>
              <option value="home">At home</option>
              <option value="hospital">In a hospital</option>
            </Select>
          </Field>
          {f.locationType === "home" ? (
            <Field label="Care address" error={err.serviceAddress} className="sm:col-span-2">
              <Input value={f.serviceAddress} onChange={(e) => setF({ ...f, serviceAddress: e.target.value })} />
            </Field>
          ) : (
            <>
              <Field label="Hospital" error={err.hospitalId}>
                <Select value={f.hospitalId} onChange={(e) => setF({ ...f, hospitalId: e.target.value })}>
                  <option value="">Select hospital</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.city ? ` (${h.city})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ward / room" error={err.wardRoom}>
                <Input value={f.wardRoom} onChange={(e) => setF({ ...f, wardRoom: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Notes" error={err.notes} className="sm:col-span-2">
            <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </div>
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
