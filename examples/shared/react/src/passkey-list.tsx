import { Button } from "./atoms";

export type PasskeyListProps = {
  passkeys: { id: string }[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  loading: boolean;
};

export function PasskeyList(props: PasskeyListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-gray-500">Passkeys</div>
      <div className="flex flex-col gap-2">
        {props.passkeys.map((passkey, i) => (
          <div
            key={passkey.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
          >
            <span className="text-sm text-gray-700">Passkey {i + 1}</span>
            {props.passkeys.length > 1 ? (
              <button
                className="text-sm text-red-500 hover:text-red-700"
                onClick={() => props.onRemove(passkey.id)}
                disabled={props.loading}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        onClick={props.onAdd}
        disabled={props.loading}
      >
        Add a passkey
      </Button>
    </div>
  );
}
