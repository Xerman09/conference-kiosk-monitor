"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Monitor, ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        setError(data.error || "Invalid administrator credentials.");
        return;
      }

      router.push("/kiosk/conference-room");
      router.refresh();
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-[#030712] text-white flex items-center justify-center p-6 overflow-hidden">
      {/* Architectural Dot Grid + Ambient Glow */}
      <div className="pointer-events-none absolute inset-0 kiosk-grid-bg opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,_rgba(99,102,241,0.22),_transparent_65%),radial-gradient(ellipse_40%_40%_at_80%_100%,_rgba(16,185,129,0.10),_transparent_60%)]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex h-15 w-15 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/25 to-indigo-600/10 border border-indigo-400/30 text-indigo-300 shadow-[0_0_32px_rgba(99,102,241,0.25)] mb-4">
            <Monitor className="h-7 w-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Conference Room Kiosk
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-xs">
            Sign in with an administrator account to select or configure a room display.
          </p>
        </div>

        {/* Elevated Glass Login Card */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-2xl p-8 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300 mb-6">
            <Lock className="h-3 w-3" />
            Admin Access
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2"
              >
                Admin Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 pr-11 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-3.5 text-sm font-semibold text-white hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-50 transition-all shadow-[0_10px_28px_rgba(99,102,241,0.35)] cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              {isSubmitting ? "Verifying..." : "Sign In as Admin"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Authorized administrators (<span className="font-mono text-slate-400">isAdmin = 1</span>) only.
        </p>
      </div>
    </div>
  );
}
