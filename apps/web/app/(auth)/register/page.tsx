"use client";

import { useState, FormEvent, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth";
import { useToast } from "../../../lib/toast";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type RegisterResponse = {
  ok?: boolean;
  error?: string;
};

type StrengthLevel = "Too short" | "Weak" | "Okay" | "Strong";

function evaluatePasswordStrength(password: string): StrengthLevel {
  if (!password || password.length < 6) return "Too short";

  let score = 0;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return "Weak";
  if (score === 2 || score === 3) return "Okay";
  return "Strong";
}

export default function RegisterPage() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(
    () => evaluatePasswordStrength(password),
    [password]
  );

  const passwordTooShort = password.length > 0 && password.length < 6;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password,
          captchaToken: captchaToken || undefined
        })
      });

      let data: RegisterResponse | null = null;
      try {
        data = (await res.json()) as RegisterResponse;
      } catch {
        // ignore parse error
      }

      if (!res.ok) {
        const message =
          data?.error ||
          (res.status === 409
            ? "That username is already taken."
            : "Unable to create account. Please try again.");
        setError(message);
        return;
      }

      // On success, backend creates a session; update client auth state and enter the app.
      await auth.refresh();
      toast.push({ kind: "success", title: "Account created" });
      router.push("/dashboard");
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
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">
            Pick a username and password to join The League.
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={submitting}
              />
              <p className="field-hint">
                Minimum 6 characters; we recommend a strong password.
              </p>
              {password && (
                <p
                  className={[
                    "password-strength",
                    strength === "Strong"
                      ? "password-strength--strong"
                      : strength === "Okay"
                      ? "password-strength--ok"
                      : "password-strength--weak"
                  ].join(" ")}
                >
                  Password strength: {strength}
                </p>
              )}
              {passwordTooShort && (
                <p className="field-warning">
                  Password is too short – at least 6 characters.
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="confirm" className="field-label">
                Confirm password
              </label>
              <input
                id="confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={submitting}
              />
              {passwordsMismatch && (
                <p className="field-warning">Passwords don&apos;t match.</p>
              )}
            </div>

            {/* Placeholder captcha input; can be swapped for real reCAPTCHA later */}
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
                Simple placeholder – actual bot protection will plug in here.
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={submitting}
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>

            <p className="auth-footer">
              Already have an account?{" "}
              <Link href="/login" className="link">
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
