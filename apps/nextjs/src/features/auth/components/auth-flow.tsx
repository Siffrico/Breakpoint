"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";

import { authClient } from "~/auth/client";

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
      className="select-none text-sm font-medium leading-none"
    >
      {children}
    </label>
  );
}

type Mode = "sign-in" | "sign-up";
const STEPS = ["Identify", "Credentials", "Welcome"] as const;

export function AuthFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setStep(0);
    setError(null);
    setPassword("");
    setName("");
  };

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter a valid email.");
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
    if (mode === "sign-up" && !name.trim()) {
      setError("Name is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const result =
      mode === "sign-in"
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

  return (
    <div className="w-full">
      <ModeToggle mode={mode} onChange={switchMode} />
      <Stepper step={step} />

      {step === 0 ? (
        <EmailStep
          mode={mode}
          email={email}
          onEmailChange={setEmail}
          onSubmit={submitEmail}
          onDiscord={continueWithDiscord}
          loading={loading}
          error={error}
        />
      ) : null}

      {step === 1 ? (
        <CredentialsStep
          mode={mode}
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
      ) : null}

      {step === 2 ? <DoneStep router={router} /> : null}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const base =
    "flex-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] transition-colors";
  return (
    <div className="flex w-fit overflow-hidden rounded-md border border-border/70 bg-background/40">
      <button
        type="button"
        onClick={() => onChange("sign-in")}
        className={`${base} ${
          mode === "sign-in"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={() => onChange("sign-up")}
        className={`${base} ${
          mode === "sign-up"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Sign up
      </button>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mt-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
      <span>
        Step {String(step + 1).padStart(2, "0")} / {STEPS.length}
      </span>
      <div className="ml-2 flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step
                ? "w-5 bg-foreground"
                : i < step
                  ? "w-1.5 bg-foreground/70"
                  : "w-1.5 bg-foreground/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-3 text-sm text-destructive">{message}</p>;
}

function EmailStep({
  mode,
  email,
  onEmailChange,
  onSubmit,
  onDiscord,
  loading,
  error,
}: {
  mode: Mode;
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  onDiscord: () => void;
  loading: boolean;
  error: string | null;
}) {
  const isSignIn = mode === "sign-in";
  return (
    <>
      <div className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        {isSignIn ? "Welcome back" : "Create your account"}
      </div>
      <h1 className="mt-2 font-display text-3xl leading-tight">
        {isSignIn ? "Sign in to continue." : "Let's get you set up."}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isSignIn
          ? "Enter your email to continue."
          : "Start with your email — we'll do the rest in a moment."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="auth-email">Email</FieldLabel>
          <Input
            id="auth-email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            nativeInput
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={!email.trim()}
          className="mt-2"
        >
          Continue
        </Button>
      </form>

      <ErrorLine message={error} />

      <div className="mt-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        <span className="h-px flex-1 bg-border/70" />
        or
        <span className="h-px flex-1 bg-border/70" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="mt-6 w-full"
        onClick={onDiscord}
        loading={loading}
      >
        Continue with Discord
      </Button>
    </>
  );
}

function CredentialsStep({
  mode,
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
  mode: Mode;
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
  const isSignIn = mode === "sign-in";
  return (
    <>
      <div className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        {isSignIn ? "Almost there" : "Tell us who you are"}
      </div>
      <h1 className="mt-2 font-display text-3xl leading-tight">
        {isSignIn ? "Enter your password." : "A name and a password."}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signing in as{" "}
        <span className="text-foreground/85">{email}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        {!isSignIn ? (
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="auth-name">Name</FieldLabel>
            <Input
              id="auth-name"
              type="text"
              placeholder="Ada Lovelace"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              nativeInput
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="auth-password">Password</FieldLabel>
          <Input
            id="auth-password"
            type="password"
            placeholder="••••••••"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            autoFocus={isSignIn}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            nativeInput
          />
        </div>

        <Button
          type="submit"
          size="lg"
          loading={loading}
          disabled={!password || (!isSignIn && !name.trim())}
          className="mt-2"
        >
          {isSignIn ? "Sign in" : "Create account"}
        </Button>
      </form>

      <ErrorLine message={error} />

      <div className="mt-6">
        <Button variant="ghost" type="button" onClick={onBack} disabled={loading}>
          Back
        </Button>
      </div>
    </>
  );
}

function DoneStep({
  router,
}: {
  router: ReturnType<typeof useRouter>;
}) {
  useEffect(() => {
    const t = setTimeout(() => {
      router.refresh();
      router.push("/");
    }, 800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <>
      <div className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        You're in
      </div>
      <h1 className="mt-2 font-display text-3xl leading-tight">Welcome.</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Taking you home…
      </p>
    </>
  );
}
