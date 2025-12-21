"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type ForgotResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSuccessMessage(null);

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          identifier,
          captchaToken: captchaToken || undefined
        })
      });

      let data: ForgotResponse | null = null;
      try {
        data = (await res.json()) as ForgotResponse;
      } catch {
        // ignore parse error
      }

if (!res.ok || data?.ok === false) {
        const fallback =
          res.statusText ||
          "Unable to process your request. Please try again in a moment.";
        const message =
          data?.error ||
          data?.message ||
          fallback;
        setError(message);
        return;
      }
const message =
        data?.message ??
        "If an account exists for that username or email, you’ll receive reset instructions shortly.";
		
      // Whether or not the user exists, we keep messaging generic.
      setSuccessMessage(message);
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
          <h1 className="auth-title">Forgot your password?</h1>
          <p className="auth-subtitle">
            Enter your username or email address and we&apos;ll help you reset
            it.
          </p>
        </div>

        <div className="card-body">
          <form className="stack stack-md" onSubmit={handleSubmit}>
            {error && <div className="form-error">{error}</div>}
            {successMessage && (
              <div className="form-success">{successMessage}</div>
            )}

            <div className="field">
              <label htmlFor="identifier" className="field-label">
                Username or email
              </label>
              <input
                id="identifier"
                className="input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            {/* Placeholder captcha */}
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
                Bot protection goes here (reCAPTCHA or similar).
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={submitting}
            >
              {submitting ? "Sending reset link…" : "Send reset instructions"}
            </button>

            <p className="auth-footer">
              Remembered it?{" "}
              <Link href="/login" className="link">
                Back to login
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
