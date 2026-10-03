"use client";

import Link from "next/link";

import { Widget } from "@/components/dashboard/Widget";
import { useDas } from "@/lib/das/context";
import { can, type Feature } from "@/lib/das/rbac";
import { isManager } from "@/lib/das/roles";

/**
 * Gate for pages that only make sense with real data: they show nothing
 * until the dashboard is connected to a DAS Engage 360 API, and (optionally)
 * only for roles the API would allow.
 */
export function RequireLive({
  managersOnly,
  feature,
  deniedMessage,
  children,
}: {
  /** Only roles the API treats as managers may open the page. */
  managersOnly?: boolean;
  /** Only roles allowed this feature (see lib/das/rbac.ts) may open the page. */
  feature?: Feature;
  deniedMessage?: string;
  children: React.ReactNode;
}) {
  const { status, me } = useDas();

  if (status === "live" && me) {
    if ((managersOnly && !isManager(me.role)) || (feature && !can(me.role, feature))) {
      return (
        <p role="alert" className="text-sm text-zinc-300">
          {deniedMessage ?? `The ${me.role} role cannot open this page.`}
        </p>
      );
    }
    return <>{children}</>;
  }

  return (
    <Widget title={status === "connecting" ? "Signing in" : "DAS Engage 360 is not connected"} className="max-w-xl">
      <p className="text-sm leading-relaxed text-zinc-300" role="status">
        {status === "connecting" ? (
          "Connecting…"
        ) : (
          <>
            Please{" "}
            <Link
              href="/connect"
              className="text-indigo-300 underline underline-offset-2"
            >
              sign in
            </Link>{" "}
            to see this page.
          </>
        )}
      </p>
    </Widget>
  );
}
