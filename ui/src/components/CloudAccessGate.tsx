import { Navigate, Outlet, useLocation, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, RefreshCw, UserRoundX } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { BootstrapPendingPage } from "@/components/BootstrapPendingPage";
import { LandingPage } from "@/pages/Landing";

function NoBoardAccessPage({
  email,
  signingOut,
  onRefresh,
  onSignOut,
}: {
  email?: string | null;
  signingOut: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
          <UserRoundX className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">No company access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {email ? (
            <>
              You are signed in as{" "}
              <span className="font-medium text-foreground">{email}</span>, but this
              account is not part of any company on this instance.
            </>
          ) : (
            "This account is signed in, but it does not have an active company membership or instance-admin access on this instance."
          )}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask an admin to invite this email, then refresh access. Or sign out and use an
          account that already belongs to this org.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="sm:flex-1" onClick={onRefresh} disabled={signingOut}>
            <RefreshCw className="size-4" />
            Refresh access
          </Button>
          <Button className="sm:flex-1" onClick={onSignOut} disabled={signingOut}>
            <LogOut className="size-4" />
            {signingOut ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CloudAccessGate() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { deploymentMode?: "local_trusted" | "authenticated"; bootstrapStatus?: "ready" | "bootstrap_pending" }
        | undefined;
      return data?.deploymentMode === "authenticated" && data.bootstrapStatus === "bootstrap_pending"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";
  const isBootstrapPending = isAuthenticatedMode && healthQuery.data?.bootstrapStatus === "bootstrap_pending";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
  });

  const boardAccessQuery = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
    enabled: isAuthenticatedMode && !isBootstrapPending && !!sessionQuery.data,
    retry: false,
  });
  const claimMutation = useMutation({
    mutationFn: () => accessApi.claimBootstrapAdmin(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.currentBoardAccess });
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.auth.session, null);
      navigate("/auth", { replace: true });
    },
  });

  const refreshBoardAccess = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
    void queryClient.invalidateQueries({ queryKey: queryKeys.access.currentBoardAccess });
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
  };

  if (
    healthQuery.isLoading ||
    (isAuthenticatedMode && sessionQuery.isLoading) ||
    (isAuthenticatedMode && !isBootstrapPending && !!sessionQuery.data && boardAccessQuery.isLoading)
  ) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
  }

  if (healthQuery.error || boardAccessQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-destructive">
        {healthQuery.error instanceof Error
          ? healthQuery.error.message
          : boardAccessQuery.error instanceof Error
            ? boardAccessQuery.error.message
            : "Failed to load app state"}
      </div>
    );
  }

  if (isBootstrapPending) {
    const health = healthQuery.data;
    if (!health) {
      return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading...</div>;
    }
    const claimError = claimMutation.error instanceof ApiError
      ? { status: claimMutation.error.status, message: claimMutation.error.message }
      : claimMutation.error instanceof Error
        ? { message: claimMutation.error.message }
        : null;
    return (
      <BootstrapPendingPage
        claimAvailable={health.deploymentExposure === "private"}
        hasActiveInvite={health.bootstrapInviteActive}
        session={sessionQuery.data}
        claimState={claimMutation.isSuccess ? "success" : claimMutation.isPending ? "claiming" : "idle"}
        claimError={claimError}
        onClaim={() => claimMutation.mutate()}
      />
    );
  }

  if (isAuthenticatedMode && !sessionQuery.data) {
    // Root is a public landing page; every other route requires signing in.
    if (location.pathname === "/") {
      return <LandingPage />;
    }
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  if (
    isAuthenticatedMode &&
    sessionQuery.data &&
    !boardAccessQuery.data?.isInstanceAdmin &&
    (boardAccessQuery.data?.companyIds.length ?? 0) === 0
  ) {
    return (
      <NoBoardAccessPage
        email={sessionQuery.data.user?.email}
        signingOut={signOutMutation.isPending}
        onRefresh={refreshBoardAccess}
        onSignOut={() => signOutMutation.mutate()}
      />
    );
  }

  return <Outlet />;
}
