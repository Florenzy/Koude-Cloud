import Login from "@/components/login";
import { platformAuth } from "@runtime";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <Login platform={platformAuth} />;
}
