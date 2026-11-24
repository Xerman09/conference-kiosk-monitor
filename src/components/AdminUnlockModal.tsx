"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, ShieldCheck, X } from "lucide-react";

interface AdminUnlockModalProps {
  open: boolean;
  onClose: () => void;
}

export function AdminUnlockModal({ open, onClose }: AdminUnlockModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

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

      setEmail("");
      setPassword("");
      onClose();
      router.push("/kiosk/conference-room");
      router.refresh();
    } catch {
      setError("Network error while verifying credentials.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 cursor-auto select-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-unlock-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1120]/95 backdrop-blur-2xl p-7 shadow-[0_24px_70px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 border border-indigo-400/30">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="admin-unlock-title"
                className="text-lg font-bold text-white"
              >
                Admin Unlock
              </h2>
              <p className="text-xs text-slate-400">
                Verify an administrator account to switch rooms.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="unlock-email"
              className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5"
            >
              Admin Email
            </label>
            <input
              id="unlock-email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company.com"
              className="w-full rounded-xl border border-white/10 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
            />
          </div>

          <div>
            <label
              htmlFor="unlock-password"
              className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="unlock-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full rounded-xl border border-white/10 bg-slate-950/90 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
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

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-50 transition-all shadow-[0_8px_24px_rgba(99,102,241,0.3)] cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              {isSubmitting ? "Verifying..." : "Unlock & Switch Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
