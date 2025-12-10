// Typography
// - Heading:   text-xl font-semibold text-gray-900
// - Text:      text-sm               text-gray-500
// - Label:     text-sm font-medium   text-gray-500
// - ErrorText: text-sm               text-red-500

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Heading({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-xl font-semibold text-gray-900", className)}
      {...props}
    />
  );
}

export function Text({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-gray-500", className)} {...props} />;
}

export function ErrorText({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-red-500", className)} {...props} />;
}

// Form elements

const buttonVariants = {
  primary: "bg-cyan-500 hover:bg-cyan-600 text-white",
  secondary: "bg-gray-700 hover:bg-gray-600 text-gray-300",
};

export function Button({
  variant,
  className,
  ...props
}: {
  variant: keyof typeof buttonVariants;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "px-6 py-3 rounded transition-colors disabled:opacity-50",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "px-6 py-3 bg-gray-700 rounded text-white placeholder-gray-500",
        className,
      )}
      {...props}
    />
  );
}

export function Form({
  children,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form {...props}>
      <Stack>{children}</Stack>
    </form>
  );
}

export function Stack({
  className,
  direction = "col",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { direction?: "row" | "col" }) {
  return (
    <div
      className={cn(
        "flex gap-2",
        direction === "row" ? "flex-row" : "flex-col",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-sm font-medium text-gray-500", className)}
      {...props}
    />
  );
}
