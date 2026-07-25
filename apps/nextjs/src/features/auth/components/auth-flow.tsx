"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  DiscordLogo,
  Warning,
} from "@phosphor-icons/react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";

import { authClient } from "~/auth/client";

type Mode = "sign-in" | "sign-up";

/**
 * Cursor-style sign-in: a single centered column — heading, OAuth, email,
 * continue. The underlying flow is two steps (identify → credentials) because
 * Better Auth needs a password; the first step is styled to read as one screen.
 */
export function AuthFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignIn = mode === "sign-in";

  const toggleMode = () => {
    setMode(isSignIn ? "sign-up" : "sign-in");
    setStep(0);
    setError(null);
    setPassword("");
    setName("");
  };

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setStep(1);
  };

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (!isSignIn && !name.trim()) {
      setError("Name is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = isSignIn
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({ email, password, name: name.trim() });

    setLoading(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Try again.");
      return;
    }

    setStep(2);
  };

  const continueWithDiscord = async () => {
    setLoading(true);
    setError(null);
    const result = await authClient.signIn.social({
      provider: "discord",
      callbackURL: "/",
    });
    if (result.error) {
      setError(result.error.message ?? "Discord sign-in failed.");
      setLoading(false);
    }
  };

  if (step === 2) return <DoneStep router={router} />;

  if (step === 1) {
    return (
      <CredentialsStep
        isSignIn={isSignIn}
        email={email}
        name={name}
        onNameChange={setName}
        password={password}
        onPasswordChange={setPassword}
        onSubmit={submitCredentials}
        onBack={() => {
          setStep(0);
          setError(null);
        }}
        loading={loading}
        error={error}
      />
    );
  }

  return (
    <IdentifyStep
      isSignIn={isSignIn}
      email={email}
      onEmailChange={setEmail}
      onSubmit={submitEmail}
      onDiscord={continueWithDiscord}
      onToggleMode={toggleMode}
      loading={loading}
      error={error}
    />
  );
}

/* ─── primitives ──────────────────────────────────────────────────────── */

function Title({ text }: { text: string }) {
  return (
    <h1 className="text-[25px] leading-[1.2] font-medium tracking-[-0.02em] text-[var(--site-fg)]">
      {text}
    </h1>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[13px] font-medium text-[var(--site-fg)]"
    >
      {children}
    </label>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-500/25 bg-red-500/8 px-3.5 py-3 text-[13.5px] leading-relaxed text-[var(--site-fg)]">
      <Warning weight="fill" className="mt-px size-4 shrink-0 text-red-400" />
      <span>{message}</span>
    </div>
  );
}

/* ─── step 0 — identify ───────────────────────────────────────────────── */

function IdentifyStep({
  isSignIn,
  email,
  onEmailChange,
  onSubmit,
  onDiscord,
  onToggleMode,
  loading,
  error,
}: {
  isSignIn: boolean;
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onDiscord: () => void;
  onToggleMode: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div>
      <Title text="Welcome to Breakpoint" />
      <p className="text-[25px] leading-[1.2] tracking-[-0.02em] text-[var(--site-text-3)]">
        A better way to learn.
      </p>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={onDiscord}
        loading={loading}
        className="mt-9 w-full border-[var(--site-line)]"
      >
        <DiscordLogo weight="fill" />
        Continue with Discord
      </Button>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-2.5">
        <FieldLabel htmlFor="auth-email">Email</FieldLabel>
        <Input
          id="auth-email"
          type="email"
          size="lg"
          placeholder="Your email address"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          nativeInput
          className="bg-[var(--site-raised)]"
        />
        <Button
          type="submit"
          size="lg"
          disabled={!email.trim()}
          className="mt-2 w-full border-[var(--site-line)]"
        >
          Continue
        </Button>
      </form>

      <ErrorLine message={error} />

      <p className="mt-7 text-center text-[14px] text-[var(--site-text-2)]">
        {isSignIn ? "Don't have an account? " : "Already have an account? "}
        <button
          type="button"
          onClick={onToggleMode}
          className="text-[var(--site-fg)] underline-offset-[3px] transition-opacity outline-none hover:underline"
        >
          {isSignIn ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

/* ─── step 1 — credentials ────────────────────────────────────────────── */

function CredentialsStep({
  isSignIn,
  email,
  name,
  onNameChange,
  password,
  onPasswordChange,
  onSubmit,
  onBack,
  loading,
  error,
}: {
  isSignIn: boolean;
  email: string;
  name: string;
  onNameChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="mb-7 inline-flex items-center gap-1.5 text-[13px] text-[var(--site-text-2)] transition-colors outline-none hover:text-[var(--site-fg)] disabled:opacity-50"
      >
        <ArrowLeft className="size-3.5" />
        Back
      </button>

      <Title text={isSignIn ? "Enter your password" : "Create your account"} />
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--site-text-2)]">
        Continuing as <span className="text-[var(--site-fg)]">{email}</span>
      </p>

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
        {!isSignIn ? (
          <div className="flex flex-col gap-2.5">
            <FieldLabel htmlFor="auth-name">Name</FieldLabel>
            <Input
              id="auth-name"
              type="text"
              size="lg"
              placeholder="Your name"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              nativeInput
              className="bg-[var(--site-raised)]"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5">
          <FieldLabel htmlFor="auth-password">Password</FieldLabel>
          <Input
            id="auth-password"
            type="password"
            size="lg"
            placeholder="Your password"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            autoFocus={isSignIn}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            nativeInput
            className="bg-[var(--site-raised)]"
          />
        </div>

        <Button
          type="submit"
          size="lg"
          loading={loading}
          disabled={!password || (!isSignIn && !name.trim())}
          className="mt-1 w-full border-[var(--site-line)]"
        >
          {isSignIn ? "Sign in" : "Create account"}
        </Button>
      </form>

      <ErrorLine message={error} />
    </div>
  );
}

/* ─── step 2 — done ───────────────────────────────────────────────────── */

function DoneStep({ router }: { router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    const t = setTimeout(() => {
      router.refresh();
      router.push("/");
    }, 900);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div>
      <div className="flex size-11 items-center justify-center rounded-lg border border-[var(--site-line)] bg-[var(--site-raised)]">
        <CheckCircle weight="fill" className="size-6 text-[var(--site-fg)]" />
      </div>
      <h1 className="mt-6 text-[25px] leading-[1.2] font-medium tracking-[-0.02em] text-[var(--site-fg)]">
        You're in.
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--site-text-2)]">
        Taking you to your workspace…
      </p>
    </div>
  );
}
