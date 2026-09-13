import { ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES,
  MAX_COMPANY_ATTACHMENT_MAX_BYTES,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { assetsApi } from "../api/assets";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Settings, CloudUpload, Download, Upload, ShieldAlert, Sparkles, Building2, Check, ArrowRight, HardDrive, Trash2 } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
} from "../components/agent-config-primitives";

const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_COMPANY_ATTACHMENT_MAX_MIB = DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;
const MAX_COMPANY_ATTACHMENT_MAX_MIB = MAX_COMPANY_ATTACHMENT_MAX_BYTES / BYTES_PER_MIB;

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [attachmentMaxMiB, setAttachmentMaxMiB] = useState(String(DEFAULT_COMPANY_ATTACHMENT_MAX_MIB));
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setAttachmentMaxMiB(String(Math.round((selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES) / BYTES_PER_MIB)));
    setLogoUrl(selectedCompany.logoUrl ?? "");
  }, [selectedCompany]);

  const attachmentMaxBytes = Number.parseInt(attachmentMaxMiB, 10) * BYTES_PER_MIB;
  const attachmentMaxValid =
    Number.isInteger(attachmentMaxBytes)
    && attachmentMaxBytes >= BYTES_PER_MIB
    && attachmentMaxBytes <= MAX_COMPANY_ATTACHMENT_MAX_BYTES;
  const cloudSyncEnabled = experimentalSettings?.enableCloudSync === true;

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
     description !== (selectedCompany.description ?? "") ||
     brandColor !== (selectedCompany.brandColor ?? "") ||
     attachmentMaxBytes !== (selectedCompany.attachmentMaxBytes ?? DEFAULT_COMPANY_ATTACHMENT_MAX_BYTES));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
      attachmentMaxBytes: number;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  const removeMutation = useMutation({
    mutationFn: ({ companyId, nextCompanyId }: { companyId: string; nextCompanyId: string | null }) =>
      companiesApi.remove(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      setDeleteConfirmName("");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="flex h-80 items-center justify-center rounded-3xl border-2 border-dashed border-border/80 p-8 text-center text-lg font-semibold text-muted-foreground bg-card/40 backdrop-blur-md">
        No company selected. Pick a company from the switcher to manage workspace settings.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null,
      attachmentMaxBytes
    });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      
      {/* Bold Modern Header & Floating Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border/80 pb-6">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-inner">
            <Settings className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-foreground">Company Settings</h1>
            <p className="text-lg text-muted-foreground mt-1 font-medium">
              Manage core workspace identity, strict governance, and high-level resource controls.
            </p>
          </div>
        </div>

        {/* Floating Save Action Bar */}
        {generalDirty && (
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-card/95 px-6 py-4 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-3">
            <span className="text-sm font-bold text-amber-500 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-500 animate-ping" />
              Unsaved changes
            </span>
            <Button
              size="default"
              onClick={handleSaveGeneral}
              disabled={generalMutation.isPending || !companyName.trim() || !attachmentMaxValid}
              className="gap-2 rounded-xl px-6 text-base font-bold shadow-lg"
            >
              <Check className="h-5 w-5" />
              {generalMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
            {generalMutation.isSuccess && (
              <span className="text-sm text-emerald-500 font-bold">Saved!</span>
            )}
            {generalMutation.isError && (
              <span className="text-sm text-destructive font-semibold">
                {generalMutation.error instanceof Error ? generalMutation.error.message : "Failed to save"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Balanced Bold 2-Column Grid Layout (No Scrolling Required) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Left Column */}
        <div className="space-y-8">
          
          {/* Card 1: General Information */}
          <div id="section-general" className="rounded-3xl border-2 border-border/80 bg-card/80 p-8 shadow-xl backdrop-blur-md space-y-6">
            <div className="flex items-center gap-3 text-lg font-black tracking-wide text-foreground">
              <div className="p-2.5 rounded-2xl bg-primary/15 text-primary">
                <Building2 className="h-6 w-6" />
              </div>
              General Information
            </div>
            <div className="space-y-5">
              <Field label="Company name" hint="Prominent display name.">
                <input
                  className="w-full rounded-2xl border-2 border-border/80 bg-background/80 px-4 py-3.5 text-base font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/20"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </Field>
              <Field label="Description" hint="Optional tagline or workspace overview.">
                <input
                  className="w-full rounded-2xl border-2 border-border/80 bg-background/80 px-4 py-3.5 text-base font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/20"
                  type="text"
                  value={description}
                  placeholder="e.g., Autonomous agent studio"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Card 2: Appearance & Visual Identity */}
          <div id="section-appearance" className="rounded-3xl border-2 border-border/80 bg-card/80 p-8 shadow-xl backdrop-blur-md space-y-6">
            <div className="flex items-center gap-3 text-lg font-black tracking-wide text-foreground">
              <div className="p-2.5 rounded-2xl bg-primary/15 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              Appearance & Visual Identity
            </div>
            
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="shrink-0 pt-2">
                <CompanyPatternIcon
                  companyName={companyName || selectedCompany.name}
                  logoUrl={logoUrl || null}
                  brandColor={brandColor || null}
                  className="rounded-3xl shadow-md border-2 border-border/80 h-20 w-20 flex items-center justify-center text-2xl font-black"
                />
              </div>
              
              <div className="flex-1 space-y-5 w-full">
                <Field label="Workspace Logo" hint="PNG, JPEG, WEBP, GIF, or SVG emblem.">
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      onChange={handleLogoFileChange}
                      className="w-full rounded-2xl border-2 border-border/80 bg-background/80 px-4 py-3 text-sm font-semibold outline-none file:mr-4 file:rounded-xl file:border-0 file:bg-primary/15 file:text-primary file:px-4 file:py-2 file:text-xs file:font-bold file:cursor-pointer hover:file:bg-primary/25 transition-all"
                    />
                    {logoUrl && (
                      <div>
                        <Button
                          size="default"
                          variant="outline"
                          onClick={handleClearLogo}
                          disabled={clearLogoMutation.isPending}
                          className="rounded-xl h-10 px-4 text-xs font-bold shadow-xs"
                        >
                          {clearLogoMutation.isPending ? "Removing..." : "Remove logo emblem"}
                        </Button>
                      </div>
                    )}
                    {(logoUploadMutation.isError || logoUploadError) && (
                      <span className="text-xs text-destructive font-bold block">
                        {logoUploadError ?? (logoUploadMutation.error instanceof Error ? logoUploadMutation.error.message : "Logo upload failed")}
                      </span>
                    )}
                    {clearLogoMutation.isError && (
                      <span className="text-xs text-destructive font-bold block">
                        {clearLogoMutation.error.message}
                      </span>
                    )}
                    {logoUploadMutation.isPending && (
                      <span className="text-xs text-primary font-bold block animate-pulse">Uploading and processing logo...</span>
                    )}
                  </div>
                </Field>

                <Field label="Brand Accent Color" hint="Primary accent hue.">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={brandColor || "#6366f1"}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-11 w-11 cursor-pointer rounded-2xl border-2 border-border/80 bg-transparent p-0 overflow-hidden shadow-md"
                    />
                    <input
                      type="text"
                      value={brandColor}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                          setBrandColor(v);
                        }
                      }}
                      placeholder="Auto (Hex)"
                      className="w-36 rounded-2xl border-2 border-border/80 bg-background/80 px-4 py-2.5 text-sm font-bold font-mono outline-none"
                    />
                    {brandColor && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setBrandColor("")}
                        className="text-xs text-muted-foreground h-10 px-3 font-bold hover:text-foreground"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </Field>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-8">
          
          {/* Card 3: Governance & Resource Controls */}
          <div id="section-governance" className="rounded-3xl border-2 border-border/80 bg-card/80 p-8 shadow-xl backdrop-blur-md space-y-6">
            <div className="flex items-center gap-3 text-lg font-black tracking-wide text-foreground">
              <div className="p-2.5 rounded-2xl bg-primary/15 text-primary">
                <ShieldAlert className="h-6 w-6" />
              </div>
              Governance & Resource Controls
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border-2 border-border/70 bg-background/60 p-5 shadow-sm" data-testid="company-settings-team-section">
                <ToggleField
                  label="Require board approval for new hires"
                  hint="New agents remain pending until board sign-off."
                  checked={!!selectedCompany.requireBoardApprovalForNewAgents}
                  onChange={(v) => settingsMutation.mutate(v)}
                  toggleTestId="company-settings-team-approval-toggle"
                />
              </div>

              <div className="rounded-2xl border-2 border-border/70 bg-background/60 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-black text-foreground">
                      <HardDrive className="h-4 w-4 text-primary" />
                      Attachment Size Limit
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      Allowed range: 1 to {MAX_COMPANY_ATTACHMENT_MAX_MIB} MiB.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={MAX_COMPANY_ATTACHMENT_MAX_MIB}
                      step={1}
                      value={attachmentMaxMiB}
                      onChange={(e) => setAttachmentMaxMiB(e.target.value)}
                      className="w-24 rounded-xl border-2 border-border/80 bg-background/90 px-3 py-2.5 text-sm font-black text-center outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                    />
                    <span className="text-xs font-black text-muted-foreground">MiB</span>
                  </div>
                </div>
                {!attachmentMaxValid && (
                  <span className="text-xs text-destructive font-bold block">
                    Enter a number between 1 and {MAX_COMPANY_ATTACHMENT_MAX_MIB}.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Card 4: Packages & Migration */}
          <div id="section-packages" className="rounded-3xl border-2 border-border/80 bg-card/80 p-8 shadow-xl backdrop-blur-md space-y-5">
            <div className="flex items-center gap-3 text-lg font-black tracking-wide text-foreground">
              <div className="p-2.5 rounded-2xl bg-primary/15 text-primary">
                <CloudUpload className="h-6 w-6" />
              </div>
              Packages & Migration
            </div>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Import and export routines are available via the{" "}
              <a href="/org" className="underline text-primary font-bold hover:text-primary/80 transition-colors inline-flex items-center gap-1">
                Org Chart header <ArrowRight className="h-4 w-4" />
              </a>
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {cloudSyncEnabled ? (
                <Button size="default" asChild className="rounded-2xl px-5 text-sm font-bold shadow-md">
                  <a href="/company/settings/cloud-upstream">
                    <CloudUpload className="mr-2 h-4 w-4" />
                    Cloud Upstream
                  </a>
                </Button>
              ) : null}
              <Button size="default" variant="outline" asChild className="rounded-2xl px-5 text-sm border-2 border-border/80 bg-background/60 font-bold shadow-xs">
                <a href="/company/export">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </a>
              </Button>
              <Button size="default" variant="outline" asChild className="rounded-2xl px-5 text-sm border-2 border-border/80 bg-background/60 font-bold shadow-xs">
                <a href="/company/import">
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </a>
              </Button>
            </div>
          </div>

          {/* Card 5: Danger Zone */}
          <div id="section-danger" className="rounded-3xl border-2 border-destructive/50 bg-card/80 p-8 shadow-xl backdrop-blur-md space-y-5">
            <div className="flex items-center gap-3 text-lg font-black tracking-wide text-destructive">
              <div className="p-2.5 rounded-2xl bg-destructive/15 text-destructive">
                <ShieldAlert className="h-6 w-6" />
              </div>
              Danger Zone
            </div>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              Archiving hides this company cleanly from sidebars while safely preserving historical records.
            </p>
            <div className="space-y-3 pt-1">
              <Button
                size="default"
                variant="destructive"
                className="w-full rounded-2xl py-3.5 text-sm font-black shadow-md"
                disabled={
                  archiveMutation.isPending ||
                  selectedCompany.status === "archived"
                }
                onClick={() => {
                  if (!selectedCompanyId) return;
                  const confirmed = window.confirm(
                    `Archive company "${selectedCompany.name}"? It will be hidden from the sidebar.`
                  );
                  if (!confirmed) return;
                  const nextCompanyId =
                    companies.find(
                      (company) =>
                        company.id !== selectedCompanyId &&
                        company.status !== "archived"
                    )?.id ?? null;
                  archiveMutation.mutate({
                    companyId: selectedCompanyId,
                    nextCompanyId
                  });
                }}
              >
                {archiveMutation.isPending
                  ? "Archiving company..."
                  : selectedCompany.status === "archived"
                  ? "Already archived"
                  : "Archive company"}
              </Button>
              {archiveMutation.isError && (
                <span className="text-xs text-destructive font-bold block text-center">
                  {archiveMutation.error instanceof Error
                    ? archiveMutation.error.message
                    : "Failed to archive company"}
                </span>
              )}
            </div>

            <div className="pt-3 border-t border-destructive/30 space-y-3">
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                Permanently deletes this company and all of its data — agents, issues, runs, teams,
                goals, secrets, costs, and audit history. This cannot be undone.
              </p>
              {removeMutation.isPending ? (
                <Button
                  size="default"
                  variant="destructive"
                  className="w-full rounded-2xl py-3.5 text-sm font-black shadow-md"
                  disabled
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Deleting company...
                </Button>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={`Type "${selectedCompany.name}" to confirm permanent deletion`}
                    className="w-full rounded-2xl border-2 border-destructive/50 bg-background/80 px-4 py-3 text-sm font-bold outline-none transition-all focus:border-destructive focus:ring-4 focus:ring-destructive/20"
                  />
                  <Button
                    size="default"
                    variant="destructive"
                    className="w-full rounded-2xl py-3.5 text-sm font-black shadow-md"
                    disabled={
                      removeMutation.isPending ||
                      deleteConfirmName.trim() !== selectedCompany.name
                    }
                    onClick={() => {
                      if (!selectedCompanyId) return;
                      if (deleteConfirmName.trim() !== selectedCompany.name) return;
                      const confirmed = window.confirm(
                        `Permanently delete company "${selectedCompany.name}" and ALL of its data? This cannot be undone.`
                      );
                      if (!confirmed) return;
                      const nextCompanyId =
                        companies.find(
                          (company) =>
                            company.id !== selectedCompanyId &&
                            company.status !== "archived"
                        )?.id ?? null;
                      removeMutation.mutate({
                        companyId: selectedCompanyId,
                        nextCompanyId
                      });
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete company permanently
                  </Button>
                </div>
              )}
              {removeMutation.isError && (
                <span className="text-xs text-destructive font-bold block text-center">
                  {removeMutation.error instanceof Error
                    ? removeMutation.error.message
                    : "Failed to delete company"}
                </span>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}