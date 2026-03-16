import type React from "react";

type PageProps<T extends React.ElementType = "div"> = {
  as?: T;
  children: React.ReactNode;
} & Omit<React.ComponentProps<T>, "as" | "children" | "className">;

export function Page<T extends React.ElementType = "div">({
  as,
  children,
  ...props
}: PageProps<T>) {
  const Tag = as ?? "div";
  return (
    <Tag className="m-auto flex w-full max-w-sm flex-col gap-8 p-8" {...props}>
      {children}
    </Tag>
  );
}

type ButtonProps = {
  variant?: "secondary";
} & Omit<React.ComponentProps<"button">, "className">;

export function Button({ variant, ...props }: ButtonProps) {
  return (
    <button
      className={
        variant === "secondary"
          ? "rounded-full border border-gray-300 py-3 text-gray-900 hover:bg-gray-100 disabled:opacity-40"
          : "rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800 disabled:opacity-40"
      }
      {...props}
    />
  );
}

export function Avatar(props: { initials: string }) {
  return (
    <div className="flex size-10 items-center justify-center rounded-full bg-gray-900 text-white">
      {props.initials}
    </div>
  );
}

export function Toolbar(props: { email: string }) {
  const initials = props.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <Avatar initials={initials} />
      <div>{props.email}</div>
    </div>
  );
}
