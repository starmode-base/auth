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
