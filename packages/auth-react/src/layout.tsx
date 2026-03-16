import type React from "react";

export function AuthLayout(props: { children: React.ReactNode; demo: string }) {
  return (
    <div className="grid min-h-dvh gap-4 p-4 text-gray-950 md:grid-cols-2">
      {props.children}
      <div className="flex gap-8 rounded-xl bg-[#F400A1]/25 p-8 text-black">
        <div className="m-auto text-center">
          <div className="text-3xl font-bold">ΛUTH</div>
          <p>{props.demo}</p>
        </div>
      </div>
    </div>
  );
}
