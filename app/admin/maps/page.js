import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { loadBuiltinMapSummaries } from "@/lib/map-pages";
import MapsAdminClient from "./maps-admin-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/maps");
  }

  return <MapsAdminClient initialMaps={loadBuiltinMapSummaries()} />;
}
