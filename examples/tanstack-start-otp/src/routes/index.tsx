import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <div className="grid min-h-dvh grid-cols-2 gap-4 p-4">
      <div className="m-auto flex w-full max-w-sm flex-col gap-8 p-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold">Welcome!</h1>
          <div className="text-gray-500">Let's get you signed in.</div>
        </div>
        <input
          type="email"
          placeholder="Email"
          className="h-10 border-b border-gray-300 bg-transparent placeholder:text-gray-500"
        />
        <button
          type="submit"
          className="rounded-full bg-gray-900 py-3 text-white hover:bg-gray-800"
        >
          Continue with email
        </button>
      </div>
      <div className="flex gap-8 rounded-xl bg-pink-500 p-8">
        <div className="m-auto text-center">
          <h1 className="text-3xl font-bold">STΛR MODΞ</h1>
          <p>One-time password demo</p>
        </div>
      </div>
    </div>
  );
}
