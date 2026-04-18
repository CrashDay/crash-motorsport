import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { loadMapPages } from "@/lib/map-pages";
import MapsAdminClient from "./maps-admin-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/maps");
  }

  const maps = await loadMapPages();
  return <MapsAdminClient initialMaps={maps} />;
}
