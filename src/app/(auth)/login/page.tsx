import { HeartPulse } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Care Booking" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ next }, settings] = await Promise.all([searchParams, getSettings()]);
  const brand = settings.company_name || "Care Booking";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* extra soft blobs behind the card */}
      <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-sky-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-violet-300/40 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 top-10 h-40 w-40 rounded-full bg-orange-200/50 blur-3xl" />

      <div className="glass-strong relative w-full max-w-[400px] px-8 pt-10 pb-8 sm:px-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#6658f5] to-[#a78bfa] text-white shadow-[0_12px_30px_-10px_rgba(102,88,245,0.8)]">
          <HeartPulse size={28} />
        </div>
        <h1 className="text-center text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 mb-7 text-center text-sm text-muted">Sign in to {brand}</p>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
