"use client";
import { useState } from "react";
import { Cloud, ArrowRight, ShieldCheck } from "lucide-react";
export default function Login({ platform }: { platform: boolean }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/auth/${register ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(form)),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      window.location.assign("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <a href="/" className="brand">
          <Cloud size={38} />
          <span>
            koude<small>CLOUD</small>
          </span>
        </a>
        <div>
          <h1>
            Your files.
            <br />A little more
            <br />
            <span className="text-blue-200">at home.</span>
          </h1>
          <p>
            A quiet place for the things you create, collect, and want to keep.
          </p>
        </div>
        <div className="auth-foot flex items-center gap-2">
          <ShieldCheck size={16} />
          YOUR SPACE. YOUR CONTROL.
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <h2>{register ? "Make yourself at home" : "Welcome back"}</h2>
          <p>
            {register
              ? "Create your personal cloud."
              : "Your files are waiting for you."}
          </p>
          {platform ? (
            <a
              className="btn primary"
              href="/signin-with-chatgpt?return_to=%2F"
              target="_top"
            >
              Sign in with ChatGPT
              <ArrowRight size={17} />
            </a>
          ) : (
            <>
              {register && (
                <>
                  <label className="input-label" htmlFor="name">
                    Name
                  </label>
                  <input
                    className="field"
                    id="name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={80}
                  />
                </>
              )}
              <label className="input-label" htmlFor="email">
                Email
              </label>
              <input
                className="field"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
              <label className="input-label" htmlFor="password">
                Password
              </label>
              <input
                className="field"
                id="password"
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete={register ? "new-password" : "current-password"}
              />
              {register && (
                <span className="text-xs text-slate-400 block mt-2">
                  At least 12 characters.
                </span>
              )}
              <button className="btn primary" disabled={busy}>
                {busy ? "One moment…" : register ? "Create account" : "Sign in"}
                <ArrowRight size={17} />
              </button>
              <p className="text-center">
                {register ? "Already have an account?" : "New to Koude?"}{" "}
                <button
                  type="button"
                  className="text-blue-200 ml-1"
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                  }}
                >
                  {register ? "Sign in" : "Create an account"}
                </button>
              </p>
            </>
          )}
          {error && (
            <div role="alert" className="error-banner mt-5">
              {error}
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
