import { useQueryClient } from "@tanstack/react-query";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { signOutSupabase } from "@/lib/supabase";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      // An unavailable server cannot prove that its httpOnly cookie was revoked.
      if (!(error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED")) {
        await queryClient.cancelQueries();
        queryClient.clear();
        throw error;
      }
    }
    await signOutSupabase();
    await queryClient.cancelQueries();
    // Clear every protocol, review, chat, and mutation cache before another login.
    queryClient.clear();
    utils.auth.me.setData(undefined, null);
  }, [logoutMutation, queryClient, utils]);

  const state = useMemo(() => {
    // Do not persist the user profile (email/role/openId) to localStorage —
    // it has no readers and needlessly exposes PII to any same-origin script.
    // The session lives in an httpOnly cookie; auth.me is the source of truth.
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
