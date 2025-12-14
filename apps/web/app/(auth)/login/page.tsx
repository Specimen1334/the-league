"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../lib/toast";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const toast = useToast();
 const rawNext = searchParams.get("next");

	// If next is "/", treat it as wanting the main app home: /dashboard
	const redirectTo =
	  !rawNext || rawNext === "/" ? "/dashboard" : rawNext;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password,
          rememberMe,
          captchaToken: captchaToken || undefined
        })
      });

      let data: LoginResponse | null = null;
      try {
        data = (await res.json()) as LoginResponse;
      } catch {
        // ignore JSON parse errors; we’ll fall back to status text
      }

      if (!res.ok) {
        const message =
          data?.error ||
          (res.status === 401
            ? "Invalid username or password."
            : "Unable to log in. Please try again.");
        setError(message);
        return;
      }

      // success – go to dashboard (or ?next=)
      await auth.refresh();
      toast.push({ kind: "success", title: "Welcome back" });
      router.push(redirectTo);
    } catch (err) {
      console.error(err);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="card-header">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">
            Log in to manage your team, drafts, and leagues.
          </p>
        </div>

        <div className="card-body">
          <form className="stack stack-md" onSubmit={handleSubmit}>
            {error && <div className="form-error">{error}</div>}

            <div className="field">
              <label htmlFor="username" className="field-label">
                Username
              </label>
              <input
                id="username"
                className="input"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            <div className="field">
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            {/* Placeholder captcha input; can swap for actual reCAPTCHA widget later */}
            <div className="field">
              <label htmlFor="captcha" className="field-label">
                Captcha
              </label>
              <input
                id="captcha"
                className="input"
                placeholder="Type the characters you see"
                value={captchaToken}
                onChange={(e) => setCaptchaToken(e.target.value)}
                disabled={submitting}
              />
              <p className="field-hint">
                Simple placeholder – replace with real captcha widget later.
              </p>
            </div>

            <div className="field field--inline">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={submitting}
                />
                <span>Remember me on this device</span>
              </label>

              <Link href="/forgot-password" className="link">
				  Forgot password?
				</Link>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>

            <p className="auth-footer">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="link">
                Register
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
