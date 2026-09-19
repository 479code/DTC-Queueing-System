"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, KeyRound, LoaderCircle, LogOut, ShieldCheck, Truck } from "lucide-react";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type Auth
} from "firebase/auth";

type SignInScreenProps = {
  auth: Auth;
};

function friendlyAuthError(error: unknown): string {
  if (!(error instanceof Error)) return "Unable to sign in. Please try again.";
  if (error.message.includes("invalid-credential")) return "The email address or password was not recognised.";
  if (error.message.includes("too-many-requests")) return "Too many attempts. Please wait a moment before trying again.";
  return "Unable to sign in. Please check your connection and try again.";
}

export function SignInScreen({ auth }: SignInScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (signInError) {
      setError(friendlyAuthError(signInError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPassword = async () => {
    const address = email.trim();
    if (!address) {
      setError("Enter your work email first, then request a reset link.");
      return;
    }
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, address);
      setNotice("A password reset link has been sent if that address is registered.");
    } catch {
      setError("Unable to request a reset link. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="accessGate">
      <section className="accessIntro" aria-label="System identity">
        <div className="accessBrand"><span><Truck size={22} /></span><strong>Fleet Queue Control</strong></div>
        <div className="accessIntroCopy">
          <span>Refinery operations</span>
          <h1>Control the next move.</h1>
          <p>Queue position, programming, and movement decisions stay visible to the people responsible for them.</p>
        </div>
        <div className="accessSignals" aria-hidden="true">
          <div><span /><small>FIFO queue</small></div>
          <div><span /><small>Role controlled</small></div>
          <div><span /><small>Audited actions</small></div>
        </div>
      </section>

      <section className="accessPanel" aria-labelledby="sign-in-title">
        <form className="signInForm" onSubmit={signIn}>
          <div className="signInHeading">
            <span className="accessIcon"><KeyRound size={20} /></span>
            <p>Staff access</p>
            <h2 id="sign-in-title">Sign in to operations</h2>
            <span>Use the work account assigned to you by an administrator.</span>
          </div>
          {error ? <p className="accessMessage error"><AlertCircle size={16} />{error}</p> : null}
          {notice ? <p className="accessMessage notice"><ShieldCheck size={16} />{notice}</p> : null}
          <label>Work email<input autoComplete="email" inputMode="email" onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required type="email" value={email} /></label>
          <label>Password<input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required type="password" value={password} /></label>
          <button className="accessSubmit" disabled={isSubmitting} type="submit">{isSubmitting ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}<span>{isSubmitting ? "Signing in" : "Sign in"}</span></button>
          <button className="resetButton" disabled={isSubmitting} onClick={() => void resetPassword()} type="button">Forgot password?</button>
        </form>
      </section>
    </main>
  );
}

type AccessPendingScreenProps = {
  email: string;
  onSignOut: () => void;
};

export function AccessPendingScreen({ email, onSignOut }: AccessPendingScreenProps) {
  return (
    <main className="accessGate pendingGate">
      <section className="accessPanel" aria-labelledby="access-pending-title">
        <div className="accessPending">
          <span className="accessIcon"><ShieldCheck size={22} /></span>
          <p>Account recognised</p>
          <h1 id="access-pending-title">Access is waiting for assignment.</h1>
          <span>{email || "This account"} has not been assigned a refinery role yet.</span>
          <p className="pendingNote">An administrator must assign your site and responsibilities before you can enter the operations workspace.</p>
          <button aria-label="Sign out" className="secondaryButton commandButton" onClick={onSignOut} title="Sign out" type="button"><LogOut size={16} />Sign out</button>
        </div>
      </section>
    </main>
  );
}
