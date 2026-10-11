"use client";

import { useSignIn, useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Plane,
  ImageIcon,
  Map,
  Crown,
  Users,
  Upload,
  Flag,
  Activity,
} from "lucide-react";
import { useProStatus } from "~/hooks/useProStatus";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import { ModerationTab } from "./_components/ModerationTab";
import { AcarsModerationTab } from "./_components/AcarsModerationTab";
import { AdminHeader } from "./_components/AdminHeader";
import { AdminAccessDenied } from "./_components/AdminAccessDenied";
import { AdminSkeleton, AdminTabSkeleton } from "./_components/skeletons";
import {
  type MainTab,
  getAdminTabFromPath,
  getAdminTabHref,
} from "./adminTabs";

const AircraftImagesTab = dynamic(
  () =>
    import("./_components/AircraftImagesTab").then(
      (mod) => mod.AircraftImagesTab,
    ),
  {
    loading: () => <AdminTabSkeleton />,
  },
);

const AirportChartsTab = dynamic(
  () =>
    import("./_components/AirportChartsTab").then(
      (mod) => mod.AirportChartsTab,
    ),
  {
    loading: () => <AdminTabSkeleton />,
  },
);

const ChallengesTab = dynamic(
  () => import("./_components/ChallengesTab").then((mod) => mod.ChallengesTab),
  {
    loading: () => <AdminTabSkeleton />,
  },
);

const ProManagementTab = dynamic(
  () =>
    import("./_components/ProManagementTab").then(
      (mod) => mod.ProManagementTab,
    ),
  {
    loading: () => <AdminTabSkeleton />,
  },
);

const VirtualAirlinesTab = dynamic(
  () =>
    import("./_components/VirtualAirlinesTab").then(
      (mod) => mod.VirtualAirlinesTab,
    ),
  {
    loading: () => <AdminTabSkeleton />,
  },
);

const AdminTelemetryTab = dynamic(
  () =>
    import("./_components/AdminTelemetryTab").then(
      (mod) => mod.AdminTelemetryTab,
    ),
  {
    loading: () => <AdminTabSkeleton />,
  },
);

const ChartUploadModal = dynamic(
  () =>
    import("./_components/ChartUploadModal").then(
      (mod) => mod.ChartUploadModal,
    ),
  {
    loading: () => null,
  },
);

const ImageUploadModal = dynamic(
  () =>
    import("./_components/ImageUploadModal").then(
      (mod) => mod.ImageUploadModal,
    ),
  {
    loading: () => null,
  },
);

export default function AdminPage() {
  const { isSignedIn, isLoaded } = useUser();
  const { signIn, isLoaded: isSignInLoaded } = useSignIn();
  const router = useRouter();
  const pathname = usePathname();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [oauthRedirectFailed, setOauthRedirectFailed] = useState(false);
  const oauthRedirectStarted = useRef(false);
  const mainTab = getAdminTabFromPath(pathname ?? "/admin");
  const {
    isAdminUser,
    isSuperAdmin,
    isLoading: proStatusLoading,
  } = useProStatus();

  const canRunAdminQueries =
    isLoaded && Boolean(isSignedIn) && !proStatusLoading && isAdminUser;

  // Queries for counts in tab badges
  const pendingQuery = useQuery(
    api.aircraftImages.getPending,
    canRunAdminQueries ? {} : "skip",
  );
  const pendingCount = pendingQuery?.length ?? 0;
  const pendingVirtualAirlinesQuery = useQuery(
    api.virtualAirlines.getPending,
    canRunAdminQueries ? {} : "skip",
  );
  const pendingVirtualAirlinesCount = pendingVirtualAirlinesQuery?.length ?? 0;

  const loading =
    !isLoaded ||
    (!isSignedIn && !oauthRedirectFailed) ||
    proStatusLoading ||
    (canRunAdminQueries &&
      (pendingQuery === undefined ||
        pendingVirtualAirlinesQuery === undefined));

  useEffect(() => {
    if (
      !isLoaded ||
      !isSignInLoaded ||
      isSignedIn ||
      !signIn ||
      oauthRedirectStarted.current
    ) {
      return;
    }

    oauthRedirectStarted.current = true;
    setOauthRedirectFailed(false);

    void signIn
      .authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: pathname ?? "/admin",
      })
      .catch((error) => {
        console.error("Failed to start Google OAuth", error);
        oauthRedirectStarted.current = false;
        setOauthRedirectFailed(true);
      });
  }, [isLoaded, isSignInLoaded, isSignedIn, pathname, signIn]);

  useEffect(() => {
    if (!isLoaded || proStatusLoading || !isAdminUser) return;
    if ((mainTab === "pro" || mainTab === "activity") && !isSuperAdmin) {
      router.replace("/admin");
    }
  }, [isLoaded, proStatusLoading, isAdminUser, isSuperAdmin, mainTab, router]);

  if (loading) {
    return <AdminSkeleton />;
  }

  if (!isSignedIn || !isAdminUser) {
    return <AdminAccessDenied />;
  }

  if ((mainTab === "pro" || mainTab === "activity") && !isSuperAdmin) {
    return <AdminSkeleton />;
  }

  const mobileTabs: {
    value: MainTab;
    label: string;
    badge?: number;
  }[] = [
    {
      value: "images",
      label: "Aircraft Images",
      badge: pendingCount || undefined,
    },
    { value: "charts", label: "Airport Charts" },
    { value: "moderation", label: "Moderation" },
    { value: "acars-moderation", label: "ACARS auto-mod" },
    {
      value: "virtual-airlines",
      label: "Virtual Airlines",
      badge: pendingVirtualAirlinesCount || undefined,
    },
    { value: "challenges", label: "Challenges" },
    ...(isSuperAdmin ? [{ value: "pro" as const, label: "Pro" }] : []),
    ...(isSuperAdmin
      ? [{ value: "activity" as const, label: "Activity" }]
      : []),
  ];

  return (
    <div className="admin-theme-surface min-h-screen bg-black text-white">
      <AdminHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 sm:px-4">
            <Plane className="h-4 w-4 text-cyan-400" />
            <span className="font-mono text-sm text-cyan-400">ADMIN PANEL</span>
          </div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Admin Dashboard
          </h1>
        </div>

        {/* Main Tabs */}
        <div className="mb-4 sm:hidden">
          <Select
            value={mainTab}
            onValueChange={(value) =>
              router.push(getAdminTabHref(value as MainTab))
            }
          >
            <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/5 font-mono text-sm text-white shadow-none hover:bg-white/[0.07] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20">
              <SelectValue placeholder="Choose admin section" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b1118] text-white">
              {mobileTabs.map((tab) => (
                <SelectItem
                  key={tab.value}
                  value={tab.value}
                  className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
                >
                  {tab.badge ? `${tab.label} (${tab.badge})` : tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mb-6 hidden flex-wrap items-center gap-2 border-b border-white/10 pb-4 sm:flex">
          <button
            onClick={() => router.push(getAdminTabHref("images"))}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all ${
              mainTab === "images"
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Aircraft Images
            {pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => router.push(getAdminTabHref("charts"))}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all ${
              mainTab === "charts"
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            <Map className="h-4 w-4" />
            Airport Charts
          </button>
          <button
            onClick={() => router.push(getAdminTabHref("virtual-airlines"))}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all ${
              mainTab === "virtual-airlines"
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            <Users className="h-4 w-4" />
            Virtual Airlines
            {pendingVirtualAirlinesCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-300">
                {pendingVirtualAirlinesCount}
              </span>
            )}
          </button>
          <button
            onClick={() => router.push(getAdminTabHref("challenges"))}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all ${
              mainTab === "challenges"
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            <Flag className="h-4 w-4" />
            Challenges
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => router.push(getAdminTabHref("pro"))}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all ${
                mainTab === "pro"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              <Crown className="h-4 w-4" />
              Pro
            </button>
          )}
          <button
            onClick={() => router.push(getAdminTabHref("moderation"))}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all ${mainTab === "moderation" ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            <Flag className="h-4 w-4" />
            Moderation
          </button>
          <button
            onClick={() => router.push(getAdminTabHref("acars-moderation"))}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all ${mainTab === "acars-moderation" ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            <Flag className="h-4 w-4" />
            ACARS auto-mod
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => router.push(getAdminTabHref("activity"))}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all ${
                mainTab === "activity"
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              <Activity className="h-4 w-4" />
              Activity
            </button>
          )}
        </div>

        {mainTab === "images" && (
          <AircraftImagesTab canRunAdminQueries={canRunAdminQueries} />
        )}
        {mainTab === "charts" && <AirportChartsTab />}
        {mainTab === "moderation" && <ModerationTab />}
        {mainTab === "acars-moderation" && <AcarsModerationTab />}
        {mainTab === "challenges" && (
          <ChallengesTab canRunAdminQueries={canRunAdminQueries} />
        )}
        {mainTab === "virtual-airlines" && (
          <VirtualAirlinesTab canRunAdminQueries={canRunAdminQueries} />
        )}
        {mainTab === "pro" && isSuperAdmin && (
          <ProManagementTab
            canRunSuperAdminQueries={canRunAdminQueries && isSuperAdmin}
          />
        )}
        {mainTab === "activity" && isSuperAdmin && (
          <AdminTelemetryTab
            canRunSuperAdminQueries={canRunAdminQueries && isSuperAdmin}
          />
        )}
      </main>

      {/* Floating Upload Button */}
      {(mainTab === "images" || mainTab === "charts") && (
        <button
          onClick={() => setShowUploadModal(true)}
          className="fixed right-4 bottom-4 z-40 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/30 transition-all hover:scale-105 hover:shadow-cyan-500/50 sm:right-8 sm:bottom-8 sm:h-14 sm:w-14 sm:px-0"
          title={
            mainTab === "images"
              ? "Upload Aircraft Image"
              : "Upload Airport Chart"
          }
        >
          <Upload className="h-6 w-6 text-white" />
          <span className="sm:hidden">
            {mainTab === "images" ? "Upload image" : "Upload chart"}
          </span>
        </button>
      )}

      {/* Upload Modal */}
      {showUploadModal && mainTab === "images" && (
        <ImageUploadModal onClose={() => setShowUploadModal(false)} />
      )}
      {showUploadModal && mainTab === "charts" && (
        <ChartUploadModal onClose={() => setShowUploadModal(false)} />
      )}
    </div>
  );
}
