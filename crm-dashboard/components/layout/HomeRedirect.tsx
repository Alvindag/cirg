"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useDas } from "@/lib/das/context";

/** Distributor partners have no dashboard: their home is the portal. */
export function HomeRedirect() {
  const { me } = useDas();
  const router = useRouter();
  useEffect(() => {
    if (me?.role === "Distributor") router.replace("/portal");
  }, [me, router]);
  return null;
}
