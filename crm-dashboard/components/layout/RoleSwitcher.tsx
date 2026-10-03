"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { DAS_API_PREFIX } from "@/lib/das/config";
import { useDas } from "@/lib/das/context";
import { roleLabel } from "@/lib/das/roles";
import { fieldClass } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type DemoUser = {
  id: string;
  fullName: string;
  role: string;
  territory: string | null;
  distributor: string | null;
};

/**
 * Built-in backend only: lets you try the platform as any role. Sign-in is
 * deliberately simple (see the README); the point is that what each role may
 * see is enforced by the server, not by this menu.
 */
export function RoleSwitcher() {
  const { me, switchUser } = useDas();
  const router = useRouter();
  const [users, setUsers] = useState<DemoUser[]>([]);

  useEffect(() => {
    fetch(`${DAS_API_PREFIX}/demo/users`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  if (!me || users.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="role-switcher" className="sr-only md:not-sr-only md:text-xs md:text-zinc-400">
        Signed in as
      </label>
      <select
        id="role-switcher"
        value={me.id}
        onChange={(e) => {
          const u = users.find((x) => x.id === e.target.value);
          switchUser(e.target.value);
          router.push(u?.role === "Distributor" ? "/portal" : "/");
        }}
        className={cn(fieldClass, "max-w-[7.5rem] py-1 text-xs [&>option]:bg-zinc-900 sm:max-w-[13rem] md:max-w-[20rem]")}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.fullName} · {u.role === "Distributor" ? `Partner, ${u.distributor}` : roleLabel(u.role)}
          </option>
        ))}
      </select>
    </div>
  );
}
