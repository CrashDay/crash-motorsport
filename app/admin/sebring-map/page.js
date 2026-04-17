import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import SebringAdminPageClient from "./sebring-admin-page-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/sebring-map");
  }

  return <SebringAdminPageClient />;
}
