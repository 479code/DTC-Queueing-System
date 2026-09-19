"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, KeyRound, LoaderCircle, ShieldCheck, Truck } from "lucide-react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../../firebase/client";

type Stage = "checking" | "ready" | "invalid" | "done";

function friendlyResetError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("expired-action-code")) return "This link has expired. Ask an administrator to send a new one.";
  if (message.includes("invalid-action-code")) return "This link has already been used or is no longer valid. Ask an administrator to send a new one.";
  if (message.includes("weak-password")) return "Choose a stronger password of at least 8 characters.";
  return "Unable to set your password. Please check your connection and try again.";
}

export default function SetPasswordPage() {
  const [stage, setStage] = useState<Stage>("checking");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get("oobCode") ?? "";
    if (!auth || params.get("mode") !== "resetPassword" || !oobCode) {
      setError("This link is incomplete. Open the most recent email you received, or ask an administrator to send a new one.");
      setStage("invalid");
      return;
    }
    setCode(oobCode);
    verifyPasswordResetCode(auth, oobCode)
      .then((address) => { setEmail(address); setStage("ready"); })
      .catch((verifyError) => { setError(friendlyResetError(verifyError)); setStage("invalid"); });
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth) return;
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmation) { setError("The two passwords do not match."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      await confirmPasswordReset(auth, code, password);
      setStage("done");
    } catch (resetError) {
      setError(friendlyResetError(resetError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="accessGate pendingGate">
      <section className="accessPanel" aria-labelledby="set-password-title">
        <form className="signInForm" onSubmit={submit}>
          <div className="signInHeading">
            <span className="accessIcon">{stage === "done" ? <ShieldCheck size={20} /> : <KeyRound size={20} />}</span>
            <p><Truck size={11} /> Fleet Queue Control</p>
            <h2 id="set-password-title">{stage === "done" ? "Password saved" : "Set your password"}</h2>
            <span>
              {stage === "checking" ? "Checking your link…" : null}
              {stage === "ready" ? <>Choose a password for <strong>{email}</strong>.</> : null}
              {stage === "done" ? "You can now sign in to the operations workspace." : null}
            </span>
          </div>
          {error ? <p className="accessMessage error"><AlertCircle size={16} />{error}</p> : null}
          {stage === "ready" ? <>
            <label>New password<input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
            <label>Confirm password<input autoComplete="new-password" onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
            <button className="accessSubmit" disabled={isSubmitting} type="submit">{isSubmitting ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}<span>{isSubmitting ? "Saving" : "Save password"}</span></button>
          </> : null}
          {stage === "done" || stage === "invalid" ? <a className="accessSubmit" href="/">Go to sign in</a> : null}
        </form>
      </section>
    </main>
  );
}
