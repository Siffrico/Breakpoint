"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  DiscordLogo,
  Warning,
} from "@phosphor-icons/react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";

import { authClient } from "~/auth/client";

type Mode = "sign-in" | "sign-up";
const STEPS = ["Identify", "Credentials", "Welcome"] as const;

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="select-none font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

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
      {/* brand mark — carries identity on the form side and on mobile */}
      <div className="mb-10 flex items-center gap-2.5">
        <span className="size-2.5 rounded-full bg-primary" />
        <span className="font-display text-sm font-semibold uppercase tracking-[0.1em]">
          Breakpoint
        </span>
      </div>

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
  const options: { value: Mode; label: string }[] = [
    { value: "sign-in", label: "Sign in" },
    { value: "sign-up", label: "Sign up" },
  ];
  return (
    <div className="flex gap-7 border-b border-border">
      {options.map(({ value, label }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              "relative pb-3 font-mono text-[11px] uppercase tracking-[0.25em] outline-none transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {active ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mt-7 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
      <span>
        Step {String(step + 1).padStart(2, "0")} /{" "}
        {String(STEPS.length).padStart(2, "0")}
      </span>
      <span className="text-foreground/75">{STEPS[step]}</span>
      <div className="ml-auto flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={cn(
              "h-0.5 w-6 transition-colors",
              i <= step ? "bg-foreground" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mt-4 flex items-start gap-2.5 border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-foreground">
      <Warning
        weight="fill"
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <span>{message}</span>
    </div>
  );
}

function StepHeading({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="mt-9">
      <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
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
      <StepHeading
        title={isSignIn ? "Sign in to continue." : "Create your account."}
        description={
          isSignIn
            ? "Enter the email tied to your Breakpoint account."
            : "Start with your email — credentials come next."
        }
      />

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
        <Field label="Email" htmlFor="auth-email">
          <Input
            id="auth-email"
            type="email"
            size="lg"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            nativeInput
          />
        </Field>
        <Button type="submit" size="lg" disabled={!email.trim()}>
          Continue
        </Button>
      </form>

      <ErrorLine message={error} />

      <div className="my-7 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={onDiscord}
        loading={loading}
      >
        <DiscordLogo />
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
      <StepHeading
        title={isSignIn ? "Enter your password." : "Tell us who you are."}
        description={
          <>
            Continuing as{" "}
            <span className="text-foreground">{email}</span>.
          </>
        }
      />

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
        {!isSignIn ? (
          <Field label="Name" htmlFor="auth-name">
            <Input
              id="auth-name"
              type="text"
              size="lg"
              placeholder="Ada Lovelace"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              nativeInput
            />
          </Field>
        ) : null}

        <Field label="Password" htmlFor="auth-password">
          <Input
            id="auth-password"
            type="password"
            size="lg"
            placeholder="••••••••"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            autoFocus={isSignIn}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            nativeInput
          />
        </Field>

        <Button
          type="submit"
          size="lg"
          loading={loading}
          disabled={!password || (!isSignIn && !name.trim())}
        >
          {isSignIn ? "Sign in" : "Create account"}
        </Button>
      </form>

      <ErrorLine message={error} />

      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="mt-7 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground outline-none transition-colors hover:text-foreground disabled:opacity-50"
      >
        <ArrowLeft className="size-3.5" />
        Back
      </button>
    </>
  );
}

function DoneStep({ router }: { router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    const t = setTimeout(() => {
      router.refresh();
      router.push("/");
    }, 800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <>
      <div className="mt-9 flex size-11 items-center justify-center border border-primary/30 bg-primary/10">
        <CheckCircle weight="fill" className="size-6 text-primary" />
      </div>
      <h1 className="mt-6 font-display text-3xl font-semibold leading-tight tracking-tight text-foreground">
        You're in.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Taking you to your environments…
      </p>
    </>
  );
}
