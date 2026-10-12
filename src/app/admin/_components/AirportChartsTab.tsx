"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import {
  deleteAirportChart,
  getChartUserInfoByIds,
  updateAirportChart,
} from "~/app/actions/airport-charts";
import {
  Trash2,
  Check,
  X,
  Map,
  CheckCircle,
  Search,
  CheckSquare,
  Square,
  ExternalLink,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "./ConfirmModal";
import { AdminChartsTabSkeleton } from "./skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { ChartType } from "~/types/airportCharts";

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "TAXI", label: "Taxi" },
  { value: "SID", label: "SID" },
  { value: "STAR", label: "STAR" },
  { value: "APPROACH", label: "Approach" },
];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface ChartType2 {
  icao: string;
  chartName: string;
  chartType: string;
  uploadedBy?: string | null;
}

interface ApprovedChart extends ChartType2 {
  id: string;
  chartUrl: string;
  approvedBy?: string | null;
}

function matchesChartSearch(
  chart: ChartType2,
  query: string,
  userInfo?: Record<string, { email: string; name: string | null }>,
) {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const uploaderEmail = chart.uploadedBy
    ? userInfo?.[chart.uploadedBy]?.email
    : undefined;
  return (
    chart.icao?.toLowerCase().includes(q) ||
    chart.chartName?.toLowerCase().includes(q) ||
    chart.chartType?.toLowerCase().includes(q) ||
    chart.uploadedBy?.toLowerCase().includes(q) ||
    uploaderEmail?.toLowerCase().includes(q)
  );
}

function EditableChartDetails({
  chartId,
  initialIcao,
  initialChartType,
  initialChartName,
  onSaveSuccess,
}: {
  chartId: string;
  initialIcao: string;
  initialChartType: ChartType;
  initialChartName: string;
  onSaveSuccess?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [icao, setIcao] = useState(initialIcao);
  const [chartType, setChartType] = useState<ChartType>(initialChartType);
  const [chartName, setChartName] = useState(initialChartName);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (
      icao === initialIcao &&
      chartType === initialChartType &&
      chartName === initialChartName
    ) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    const result = await updateAirportChart(
      chartId,
      icao,
      chartType,
      chartName,
    );
    setIsSaving(false);
    if (result.success) {
      toast.success("Chart details updated");
      setIsEditing(false);
      onSaveSuccess?.();
    } else {
      toast.error(result.error || "Failed to update chart");
    }
  };

  const handleCancel = () => {
    setIcao(initialIcao);
    setChartType(initialChartType);
    setChartName(initialChartName);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={icao}
            onChange={(e) => setIcao(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="ICAO"
            maxLength={4}
            className="w-16 rounded-md border border-cyan-500/50 bg-black/60 px-2 py-1 font-mono text-sm text-cyan-400 outline-none focus:border-cyan-400"
            disabled={isSaving}
            autoFocus
          />
          <Select
            value={chartType}
            onValueChange={(value) => setChartType(value as ChartType)}
            disabled={isSaving}
          >
            <SelectTrigger className="h-8 min-w-[132px] rounded-md border-blue-500/50 bg-black/60 px-2 text-sm text-blue-300 shadow-none hover:bg-black/70 focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b1118] text-white">
              {CHART_TYPES.map((type) => (
                <SelectItem
                  key={type.value}
                  value={type.value}
                  className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
                >
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input
          type="text"
          value={chartName}
          onChange={(e) => setChartName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Chart Name"
          className="w-full rounded-md border border-white/20 bg-black/60 px-2 py-1 text-sm text-white outline-none focus:border-white/40"
          disabled={isSaving}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="cursor-pointer rounded-md bg-emerald-500/20 p-1 text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="cursor-pointer rounded-md bg-red-500/20 p-1 text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/details">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-cyan-500/20 px-2 py-1 font-mono text-sm font-bold text-cyan-400">
          {initialIcao}
        </span>
        <span className="rounded-md bg-blue-500/20 px-2 py-1 text-xs font-medium text-blue-400">
          {initialChartType}
        </span>
        <button
          onClick={() => setIsEditing(true)}
          className="cursor-pointer rounded-md p-1 text-slate-600 opacity-0 transition-all group-hover/details:opacity-100 hover:bg-white/10 hover:text-cyan-400"
          title="Edit chart details"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="truncate text-sm text-white" title={initialChartName}>
        {initialChartName}
      </p>
    </div>
  );
}

export function AirportChartsTab({
  approvedCharts: preloadedApprovedCharts,
}: {
  approvedCharts?: readonly ApprovedChart[];
}) {
  const fallbackApprovedQuery = useQuery(api.airportCharts.getApproved);
  const approvedQuery =
    preloadedApprovedCharts === undefined
      ? fallbackApprovedQuery
      : preloadedApprovedCharts;
  const approvedCharts = useMemo(() => approvedQuery ?? [], [approvedQuery]);
  const isLoading = approvedQuery === undefined;

  const [userInfo, setUserInfo] = useState<
    Record<string, { email: string; name: string | null }>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [icaoFilter, setIcaoFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<ChartType | "">("");
  const [uploaderFilter, setUploaderFilter] = useState("");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCharts, setSelectedCharts] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetInfo, setDeleteTargetInfo] = useState<{
    icao: string;
    chartName: string;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteTargetIds, setBulkDeleteTargetIds] = useState<string[]>([]);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const uniqueIcaos = useMemo(() => {
    const icaos = new Set<string>();
    approvedCharts.forEach((chart) => {
      if (!chart.icao) return;
      if (!matchesChartSearch(chart, searchQuery, userInfo)) return;
      if (typeFilter && chart.chartType !== typeFilter) return;
      if (uploaderFilter && chart.uploadedBy !== uploaderFilter) return;
      icaos.add(chart.icao);
    });
    return Array.from(icaos).sort();
  }, [approvedCharts, searchQuery, typeFilter, uploaderFilter, userInfo]);

  const uniqueUploaders = useMemo(() => {
    const uploaders = new globalThis.Map<string, string>();
    approvedCharts.forEach((chart) => {
      if (!chart.uploadedBy) return;
      if (!matchesChartSearch(chart, searchQuery, userInfo)) return;
      if (icaoFilter && chart.icao !== icaoFilter) return;
      if (typeFilter && chart.chartType !== typeFilter) return;

      const info = userInfo[chart.uploadedBy];
      const label =
        info?.email && info.email !== "Unknown"
          ? info.email
          : info?.name || chart.uploadedBy;
      uploaders.set(chart.uploadedBy, label);
    });
    return Array.from(uploaders, ([id, label]) => ({ id, label })).sort(
      (a, b) => a.label.localeCompare(b.label),
    );
  }, [approvedCharts, searchQuery, icaoFilter, typeFilter, userInfo]);

  useEffect(() => {
    if (icaoFilter && !uniqueIcaos.includes(icaoFilter)) {
      setIcaoFilter("");
    }
  }, [uniqueIcaos, icaoFilter]);

  useEffect(() => {
    if (
      uploaderFilter &&
      !uniqueUploaders.some((uploader) => uploader.id === uploaderFilter)
    ) {
      setUploaderFilter("");
    }
  }, [uniqueUploaders, uploaderFilter]);

  const hasActiveFilters =
    searchQuery || icaoFilter || typeFilter || uploaderFilter;

  const filteredCharts = useMemo(() => {
    return approvedCharts
      .filter((chart) => {
        if (icaoFilter && chart.icao !== icaoFilter) return false;
        if (typeFilter && chart.chartType !== typeFilter) return false;
        if (uploaderFilter && chart.uploadedBy !== uploaderFilter) return false;
        if (!matchesChartSearch(chart, searchQuery, userInfo)) return false;
        return true;
      })
      .sort((a, b) => {
        const icaoCompare = (a.icao || "").localeCompare(b.icao || "");
        if (icaoCompare !== 0) return icaoCompare;
        const typeCompare = (a.chartType || "").localeCompare(
          b.chartType || "",
        );
        if (typeCompare !== 0) return typeCompare;
        return (a.chartName || "").localeCompare(b.chartName || "");
      });
  }, [
    approvedCharts,
    searchQuery,
    icaoFilter,
    typeFilter,
    uploaderFilter,
    userInfo,
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredCharts.length / pageSize));
  const paginatedCharts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCharts.slice(start, start + pageSize);
  }, [currentPage, filteredCharts, pageSize]);
  const currentPageSelectionCount = paginatedCharts.filter((chart) =>
    selectedCharts.has(chart.id),
  ).length;
  const pageStart =
    filteredCharts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, filteredCharts.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, icaoFilter, typeFilter, uploaderFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const clearFilters = () => {
    setSearchQuery("");
    setIcaoFilter("");
    setTypeFilter("");
    setUploaderFilter("");
  };

  // Fetch user info
  useEffect(() => {
    const allUserIds = approvedCharts
      .flatMap((chart) => [chart.uploadedBy, chart.approvedBy])
      .filter((id): id is string => Boolean(id));
    const newIds = [...new Set(allUserIds)].filter((id) => !(id in userInfo));
    if (newIds.length > 0) {
      getChartUserInfoByIds(newIds)
        .then((info) => setUserInfo((prev) => ({ ...prev, ...info })))
        .catch((e) => console.error("Failed to fetch user info:", e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedCharts]);

  function openDeleteModal(id: string, icao: string, chartName: string) {
    setDeleteTargetId(id);
    setDeleteTargetInfo({ icao, chartName });
    setDeleteModalOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    setDeleteLoading(true);
    const result = await deleteAirportChart(deleteTargetId);
    if (result.success) {
      toast.success("Chart deleted");
    } else {
      toast.error(result.error || "Failed to delete chart");
    }
    setDeleteLoading(false);
    setDeleteModalOpen(false);
    setDeleteTargetId(null);
    setDeleteTargetInfo(null);
  }

  function toggleSelect(id: string) {
    setSelectedCharts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedCharts((prev) => {
      const next = new Set(prev);
      paginatedCharts.forEach((chart) => next.add(chart.id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedCharts(new Set());
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedCharts);
    if (ids.length === 0) return;
    setBulkDeleteTargetIds(ids);
    setBulkDeleteModalOpen(true);
  }

  async function handleBulkDeleteConfirm() {
    if (bulkDeleteTargetIds.length === 0) return;
    setBulkDeleteLoading(true);

    const results = await Promise.all(
      bulkDeleteTargetIds.map((id) => deleteAirportChart(id)),
    );
    const deleted = results.filter((r) => r.success).length;
    const failed = results.length - deleted;

    if (deleted > 0) {
      setSelectedCharts(new Set());
      if (failed > 0) {
        toast.warning(`Deleted ${deleted} charts, ${failed} failed`);
      } else {
        toast.success(`Deleted ${deleted} charts`);
      }
    } else if (failed > 0) {
      toast.error(`Failed to delete ${failed} charts`);
    }
    setBulkDeleteLoading(false);
    setBulkDeleteModalOpen(false);
    setBulkDeleteTargetIds([]);
  }

  if (isLoading) {
    return <AdminChartsTabSkeleton />;
  }

  return (
    <>
      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete Chart"
        message={
          deleteTargetInfo
            ? `Are you sure you want to delete "${deleteTargetInfo.chartName}" for ${deleteTargetInfo.icao}? This action cannot be undone.`
            : "Are you sure you want to delete this chart?"
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteTargetId(null);
          setDeleteTargetInfo(null);
        }}
      />

      <ConfirmModal
        isOpen={bulkDeleteModalOpen}
        title="Delete Charts"
        message={`Are you sure you want to delete ${bulkDeleteTargetIds.length} chart(s)? This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        isLoading={bulkDeleteLoading}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => {
          setBulkDeleteModalOpen(false);
          setBulkDeleteTargetIds([]);
        }}
      />

      {/* Search and Filters */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ICAO, chart name, type, email, user ID..."
            className="w-full rounded-lg border border-white/10 bg-black/40 py-2.5 pr-4 pl-10 text-sm text-white placeholder-slate-500 transition-all outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Select
            value={icaoFilter || "__all_airports__"}
            onValueChange={(value) =>
              setIcaoFilter(value === "__all_airports__" ? "" : value)
            }
          >
            <SelectTrigger className="h-11 w-full min-w-0 rounded-lg border-white/10 bg-black/40 font-mono text-sm text-white shadow-none hover:bg-white/[0.06] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20">
              <SelectValue placeholder="All Airports" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b1118] text-white">
              <SelectItem
                value="__all_airports__"
                className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
              >
                All Airports
              </SelectItem>
              {uniqueIcaos.map((icao) => (
                <SelectItem
                  key={icao}
                  value={icao}
                  className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
                >
                  {icao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={typeFilter || "__all_types__"}
            onValueChange={(value) =>
              setTypeFilter(
                value === "__all_types__" ? "" : (value as ChartType),
              )
            }
          >
            <SelectTrigger className="h-11 w-full min-w-0 rounded-lg border-white/10 bg-black/40 font-mono text-sm text-white shadow-none hover:bg-white/[0.06] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b1118] text-white">
              <SelectItem
                value="__all_types__"
                className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
              >
                All Types
              </SelectItem>
              {CHART_TYPES.map((type) => (
                <SelectItem
                  key={type.value}
                  value={type.value}
                  className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
                >
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={uploaderFilter || "__all_uploaders__"}
            onValueChange={(value) =>
              setUploaderFilter(value === "__all_uploaders__" ? "" : value)
            }
          >
            <SelectTrigger className="h-11 w-full min-w-0 rounded-lg border-white/10 bg-black/40 font-mono text-sm text-white shadow-none hover:bg-white/[0.06] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20">
              <SelectValue placeholder="All Uploaders" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b1118] text-white">
              <SelectItem
                value="__all_uploaders__"
                className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
              >
                All Uploaders
              </SelectItem>
              {uniqueUploaders.map((uploader) => (
                <SelectItem
                  key={uploader.id}
                  value={uploader.id}
                  className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
                >
                  {uploader.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="cursor-pointer rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-slate-400 transition-all hover:border-red-500/30 hover:text-red-400"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          {filteredCharts.length === 0
            ? "No charts to display"
            : `Showing ${pageStart}-${pageEnd} of ${filteredCharts.length} chart${filteredCharts.length !== 1 ? "s" : ""}${hasActiveFilters && filteredCharts.length !== approvedCharts.length ? ` (${approvedCharts.length} total)` : ""}`}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) =>
              setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number])
            }
          >
            <SelectTrigger className="h-10 min-w-[84px] rounded-lg border-white/10 bg-black/40 font-mono text-sm text-white shadow-none hover:bg-white/[0.06] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b1118] text-white">
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem
                  key={option}
                  value={String(option)}
                  className="font-mono text-sm text-white focus:bg-cyan-500/10 focus:text-cyan-200"
                >
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedCharts.size > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 sm:flex-row sm:items-center">
          <span className="font-mono text-sm text-cyan-400">
            {selectedCharts.size} selected
          </span>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              onClick={clearSelection}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/10"
            >
              Clear
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleteLoading}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete All
            </button>
          </div>
        </div>
      )}

      {/* Charts Header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-slate-400">
          Page {currentPage} of {totalPages}
        </span>

        {filteredCharts.length > 0 && (
          <button
            onClick={() => {
              const allVisibleSelected =
                paginatedCharts.length > 0 &&
                paginatedCharts.every((chart) => selectedCharts.has(chart.id));
              if (allVisibleSelected) {
                setSelectedCharts((prev) => {
                  const next = new Set(prev);
                  paginatedCharts.forEach((chart) => next.delete(chart.id));
                  return next;
                });
              } else {
                selectAllVisible();
              }
            }}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/10 sm:ml-auto sm:w-auto sm:justify-start"
          >
            {currentPageSelectionCount === paginatedCharts.length &&
            paginatedCharts.length > 0 ? (
              <>
                <CheckSquare className="h-4 w-4" />
                Deselect Page
              </>
            ) : (
              <>
                <Square className="h-4 w-4" />
                Select Page
              </>
            )}
          </button>
        )}
      </div>

      {/* Charts Grid */}
      {filteredCharts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-12 text-center backdrop-blur-xl">
          <Map className="mx-auto mb-4 h-12 w-12 text-slate-600" />
          <h3 className="mb-2 text-xl font-semibold text-white">
            {hasActiveFilters ? "No Matching Charts" : "No Charts Yet"}
          </h3>
          <p className="text-slate-400">
            {hasActiveFilters
              ? "Try adjusting your search or filters"
              : "Upload some charts to get started"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedCharts.map((chart) => (
            <div
              key={chart.id}
              className={`group overflow-hidden rounded-2xl border bg-black/40 backdrop-blur-xl transition-all ${
                selectedCharts.has(chart.id)
                  ? "border-cyan-500"
                  : "border-white/10 hover:border-cyan-500/30"
              }`}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-slate-900/50">
                <Image
                  src={chart.chartUrl}
                  alt={chart.chartName}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
                <button
                  onClick={() => toggleSelect(chart.id)}
                  className={`absolute top-2 left-2 cursor-pointer rounded-lg p-1.5 transition-all ${
                    selectedCharts.has(chart.id)
                      ? "bg-cyan-500 text-white"
                      : "bg-black/60 text-white opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {selectedCharts.has(chart.id) ? (
                    <CheckSquare className="h-5 w-5" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={() =>
                    openDeleteModal(chart.id, chart.icao, chart.chartName)
                  }
                  className="absolute top-2 right-2 cursor-pointer rounded-lg bg-red-500/80 p-2 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500"
                >
                  <Trash2 className="h-4 w-4 text-white" />
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <EditableChartDetails
                      chartId={chart.id}
                      initialIcao={chart.icao}
                      initialChartType={chart.chartType as ChartType}
                      initialChartName={chart.chartName}
                    />
                  </div>
                  <CheckCircle className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-400" />
                </div>
                <a
                  href={chart.chartUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1 text-xs text-cyan-400 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Chart
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredCharts.length > 0 && totalPages > 1 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white transition-all hover:border-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={currentPage === totalPages}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white transition-all hover:border-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
