import { notFound, redirect } from "next/navigation";

import AdminPage from "../page";
import { isAdminTab } from "../adminTabs";

export default async function AdminTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;

  if (tab === "upload-charts") {
    redirect("/admin/charts");
  }

  if (!isAdminTab(tab)) {
    notFound();
  }

  return <AdminPage />;
}
