"use client";

import { usePathname } from "next/navigation";
import { AdminNav } from "./admin-nav";
import { CustomerNav } from "./customer-nav";
import { ProviderNav } from "./provider-nav";
import { PushSubscribe } from "./push-subscribe";
import { PwaInstallHint } from "./pwa-install-hint";
import { RunnerNav } from "./runner-nav";

function isCustomerRoute(path: string): boolean {
  if (path.startsWith("/provider") || path.startsWith("/runner") || path.startsWith("/admin")) return false;
  if (path === "/login" || path === "/offline") return false;
  return true;
}

function isProviderRoute(path: string): boolean {
  if (!path.startsWith("/provider")) return false;
  if (path === "/provider/login" || path === "/provider/offline") return false;
  return true;
}

function isRunnerRoute(path: string): boolean {
  if (!path.startsWith("/runner")) return false;
  if (path === "/runner/login" || path === "/runner/offline") return false;
  return true;
}

function isAdminRoute(path: string): boolean {
  if (!path.startsWith("/admin")) return false;
  if (path === "/admin/login") return false;
  return true;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const showCustomerChrome = isCustomerRoute(pathname);
  const showProviderChrome = isProviderRoute(pathname);
  const showRunnerChrome = isRunnerRoute(pathname);
  const showAdminChrome = isAdminRoute(pathname);

  let mainClass = "app-main";
  if (showCustomerChrome || showProviderChrome || showRunnerChrome) mainClass += " with-nav";
  if (showAdminChrome) mainClass += " with-admin-nav";
  if (showProviderChrome) mainClass += " provider-app";
  if (showRunnerChrome) mainClass += " runner-app";
  if (showAdminChrome) mainClass += " admin-app";

  const enablePush =
    showCustomerChrome || showProviderChrome || showRunnerChrome;

  return (
    <>
      {enablePush ? <PushSubscribe /> : null}
      {showCustomerChrome ? <PwaInstallHint /> : null}
      {showProviderChrome ? (
        <PwaInstallHint
          storageKey="picki-provider-pwa-dismiss"
          message="Cài Picki Provider lên màn hình chính để nhận đơn nhanh hơn."
          variant="provider"
        />
      ) : null}
      {showRunnerChrome ? (
        <PwaInstallHint
          storageKey="picki-runner-pwa-dismiss"
          message="Cài Picki Runner lên màn hình chính để giao hàng nhanh hơn."
          variant="runner"
        />
      ) : null}
      {showAdminChrome ? <AdminNav /> : null}
      <div className={mainClass}>{children}</div>
      {showCustomerChrome ? <CustomerNav /> : null}
      {showProviderChrome ? <ProviderNav /> : null}
      {showRunnerChrome ? <RunnerNav /> : null}
    </>
  );
}
