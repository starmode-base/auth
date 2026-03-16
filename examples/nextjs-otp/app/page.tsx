import { getViewer } from "./actions";
import { AuthLayout } from "@repo/auth-react";
import { HomePage } from "./home";

export default async function Page() {
  const viewer = await getViewer();

  return (
    <AuthLayout demo="One-time password demo">
      <HomePage viewer={viewer} />
    </AuthLayout>
  );
}
