import Cloud from "@/components/cloud";
import { currentUser, loginPath, logoutPath } from "@runtime";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect(loginPath);
  return <Cloud user={user} logoutPath={logoutPath} />;
}
