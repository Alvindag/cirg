"use client";

import { useMemo } from "react";

import { useDas } from "./context";
import { isManager } from "./roles";
import { shortId } from "./format";
import type { AppUser, Product } from "./types";
import { useDasQuery } from "./useDasQuery";

/** Maps user ids to names. Only managers can list users; for others ids are shortened. */
export function useUserNames() {
  const { me } = useDas();
  const q = useDasQuery<AppUser[]>(
    me && isManager(me.role) ? "/admin/users" : null,
    { includeInactive: true },
  );
  return useMemo(() => {
    const users = q.data ?? [];
    const map = new Map(users.map((u) => [u.id, u.fullName]));
    // Non-managers cannot list users, but they can always name themselves.
    if (me) map.set(me.id, me.fullName);
    return {
      users,
      name: (id: string | null | undefined) =>
        id ? (map.get(id) ?? shortId(id)) : "—",
    };
  }, [q.data, me]);
}

export function useProducts() {
  const q = useDasQuery<Product[]>("/admin/products");
  return useMemo(() => {
    const products = q.data ?? [];
    const map = new Map(products.map((p) => [p.id, p.name]));
    return {
      products,
      name: (id: string) => map.get(id) ?? shortId(id),
      reload: q.reload,
    };
  }, [q.data, q.reload]);
}
