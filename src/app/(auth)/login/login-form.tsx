"use client";

import { Lock, Mail } from "lucide-react";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const inputCls =
  "h-12 w-full rounded-full border border-white/90 bg-white/65 pl-11 pr-5 text-sm text-ink outline-none transition placeholder:text-[#9a9ab8] focus:border-accent focus:bg-white focus:shadow-[0_0_0_4px_rgba(102,88,245,0.12)]";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-2.5 text-center text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <div>
        <div className="relative">
          <Mail size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            name="email"
            type="email"
            placeholder="E-mail"
            aria-label="E-mail"
            autoComplete="username"
            defaultValue={state?.email}
            required
            className={inputCls}
          />
        </div>
        {state?.fieldErrors?.email && <p className="mt-1 pl-5 text-xs text-rose-600">{state.fieldErrors.email[0]}</p>}
      </div>

      <div>
        <div className="relative">
          <Lock size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            name="password"
            type="password"
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            required
            className={inputCls}
          />
        </div>
        {state?.fieldErrors?.password && <p className="mt-1 pl-5 text-xs text-rose-600">{state.fieldErrors.password[0]}</p>}
      </div>

      <div className="pt-3 text-center">
        <button
          type="submit"
          disabled={pending}
          className="h-11 w-44 rounded-full bg-gradient-to-r from-[#6658f5] to-[#8b5cf6] text-sm font-semibold tracking-wide text-white shadow-[0_10px_24px_-10px_rgba(102,88,245,0.9)] transition hover:brightness-105 disabled:opacity-60"
        >
          {pending ? "SIGNING IN…" : "SIGN IN"}
        </button>
      </div>

      <div className="mx-auto mt-2 h-1 w-8 rounded-full bg-accent/30" />
      <p className="text-center text-xs text-muted">Staff accounts are created by the Director.</p>
    </form>
  );
}
