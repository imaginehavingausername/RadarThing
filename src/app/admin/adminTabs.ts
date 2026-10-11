export const ADMIN_TABS = [
  "images",
  "charts",
  "challenges",
  "virtual-airlines",
  "pro",
  "activity",
  "moderation",
  "acars-moderation",
] as const;

export type MainTab = (typeof ADMIN_TABS)[number];

export function isAdminTab(value: string): value is MainTab {
  return ADMIN_TABS.includes(value as MainTab);
}

export function getAdminTabHref(tab: MainTab): string {
  return tab === "images" ? "/admin" : `/admin/${tab}`;
}

export function getAdminTabFromPath(pathname: string): MainTab {
  const segments = pathname.split("/").filter(Boolean);
  const tabSegment = segments[1];

  if (!tabSegment) return "images";
  return isAdminTab(tabSegment) ? tabSegment : "images";
}
