"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSettingsAction } from "@/app/(app)/_actions/records";
import { Button, Field, Input } from "@/components/ui";

type S = { company_name: string; company_name_si: string; company_address: string; company_phone: string; public_base_url: string };

export function SettingsForm({ initial }: { initial: S }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateSettingsAction(v);
          if (!r.ok) {
            setErr(r.fieldErrors ?? {});
            toast.error(r.error);
            return;
          }
          toast.success("Settings saved");
          router.refresh();
        });
      }}
    >
      <Field label="Company name" error={err.company_name} className="sm:col-span-2">
        <Input value={v.company_name} onChange={(e) => setV({ ...v, company_name: e.target.value })} />
      </Field>
      <Field
        label="Company name in Sinhala"
        error={err.company_name_si}
        hint="Shown on the Sinhala employee registration form. Leave empty to use the English name."
        className="sm:col-span-2"
      >
        <Input value={v.company_name_si} onChange={(e) => setV({ ...v, company_name_si: e.target.value })} placeholder="උදා: සදාසරණ උපස්ථාන සේවා" />
      </Field>
      <Field label="Address (on invoices)" error={err.company_address} className="sm:col-span-2">
        <Input value={v.company_address} onChange={(e) => setV({ ...v, company_address: e.target.value })} />
      </Field>
      <Field label="Phone (on invoices)" error={err.company_phone}>
        <Input value={v.company_phone} onChange={(e) => setV({ ...v, company_phone: e.target.value })} />
      </Field>
      <Field
        label="Public web address (invoice links on WhatsApp)"
        error={err.public_base_url}
        hint="The address customers can open from their phone, e.g. https://care.example.lk. Leave empty until the system is online: WhatsApp messages are then sent without the invoice link."
        className="sm:col-span-2"
      >
        <Input
          type="url"
          inputMode="url"
          value={v.public_base_url}
          onChange={(e) => setV({ ...v, public_base_url: e.target.value.replace(/\s/g, "") })}
          placeholder="https://care.example.lk"
        />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
