import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { FormEvent, useState } from "react";
import { auth, googleProvider } from "../lib/firebase";

export default function SignIn() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Firebase: /, "") : String(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run(() =>
      mode === "signin" ? signInWithEmailAndPassword(auth, email, password) : createUserWithEmailAndPassword(auth, email, password),
    );
  }

  return (
    <div className="center-card">
      <div className="card signin">
        <img src="/icon.svg" alt="" width={48} height={48} />
        <h1>Tax Assistant</h1>
        <p className="muted">Scan and organise receipts, track income and mileage, and ask Claude about your tax affairs.</p>
        <button className="btn primary wide" disabled={busy} onClick={() => run(() => signInWithPopup(auth, googleProvider))}>
          Continue with Google
        </button>
        <div className="divider">or</div>
        <form onSubmit={submit} className="stack">
          <input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn wide" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {info && <p className="muted">{info}</p>}
        <div className="row-links">
          <button className="link" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
          {mode === "signin" && (
            <button
              className="link"
              onClick={() =>
                email
                  ? run(async () => {
                      await sendPasswordResetEmail(auth, email);
                      setInfo("Password reset email sent.");
                    })
                  : setError("Enter your email first.")
              }
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
