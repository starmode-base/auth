import type React from "react";
import { Page, Button } from "./atoms";

export type StepProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  valid: boolean;
  error: string | null;
};

function Step(props: {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  error: string | null;
  valid: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputProps?: React.ComponentProps<"input">;
}) {
  return (
    <Page
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (!props.valid) return;
        props.onSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">{props.title}</div>
        <div className="text-gray-500">{props.description}</div>
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder={props.placeholder}
          className="h-10 border-b border-gray-300 bg-transparent placeholder:text-gray-500"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          {...props.inputProps}
        />
        {props.error !== null ? (
          <div className="text-red-500">{props.error}</div>
        ) : null}
      </div>
      <Button type="submit" disabled={!props.valid}>
        {props.label}
      </Button>
    </Page>
  );
}

export function EmailStep(props: StepProps) {
  return (
    <Step
      title="Welcome!"
      description="Let's get you signed in."
      label="Send one-time password"
      placeholder="Email address"
      inputProps={{
        inputMode: "email",
        autoComplete: "email",
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
      }}
      {...props}
    />
  );
}

export function OtpStep(props: StepProps) {
  return (
    <Step
      title="Check your email"
      description="Enter your one-time password."
      label="Continue"
      placeholder="One-time password"
      inputProps={{
        inputMode: "numeric",
        autoComplete: "one-time-code",
      }}
      {...props}
    />
  );
}

export function ChangeEmailStep(props: StepProps) {
  return (
    <Step
      title="Change email"
      description="Enter your new email address."
      label="Send one-time password"
      placeholder="New email address"
      inputProps={{
        inputMode: "email",
        autoComplete: "email",
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
      }}
      {...props}
    />
  );
}

export function VerifyEmailStep(props: StepProps) {
  return (
    <Step
      title="Verify new email"
      description="Enter the one-time password sent to your new email."
      label="Change email"
      placeholder="One-time password"
      inputProps={{
        inputMode: "numeric",
        autoComplete: "one-time-code",
      }}
      {...props}
    />
  );
}
