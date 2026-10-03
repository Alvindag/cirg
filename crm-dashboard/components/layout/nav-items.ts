import {
  Activity,
  BarChart3,
  CalendarCheck,
  Calculator,
  Database,
  KanbanSquare,
  LayoutDashboard,
  ClipboardList,
  PackageCheck,
  PackageSearch,
  ScrollText,
  ShieldCheck,
  Truck,
  UserSquare,
  Users,
  type LucideIcon,
} from "lucide-react";

import { can, type Feature } from "@/lib/das/rbac";
import type { Role } from "@/lib/das/types";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  feature: Feature;
};
export type NavGroup = { heading: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    heading: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard, feature: "dashboard" }],
  },
  {
    heading: "Sell",
    items: [
      { label: "Customers", href: "/customers", icon: UserSquare, feature: "customers" },
      { label: "Pipeline", href: "/pipeline", icon: KanbanSquare, feature: "deals" },
      { label: "Visits and tasks", href: "/activities", icon: CalendarCheck, feature: "activities" },
      { label: "Orders", href: "/orders", icon: ClipboardList, feature: "orderDesk" },
      { label: "Samples", href: "/samples", icon: PackageCheck, feature: "samples" },
    ],
  },
  {
    heading: "Route to market",
    items: [
      { label: "Route to market", href: "/rtm", icon: BarChart3, feature: "rtm" },
      { label: "Field force", href: "/field-force", icon: Activity, feature: "fieldForce" },
      { label: "Data quality", href: "/data-quality", icon: Database, feature: "dataQuality" },
      { label: "Batch trace", href: "/trace", icon: PackageSearch, feature: "trace" },
      { label: "Cost of ownership", href: "/tco", icon: Calculator, feature: "tco" },
    ],
  },
  {
    heading: "Partners",
    items: [{ label: "Distributor portal", href: "/portal", icon: Truck, feature: "portal" }],
  },
  {
    heading: "Admin",
    items: [
      { label: "Team", href: "/team", icon: Users, feature: "team" },
      { label: "Audit trail", href: "/audit", icon: ScrollText, feature: "audit" },
      { label: "Access rules", href: "/access", icon: ShieldCheck, feature: "access" },
    ],
  },
];

/** The menu for one role. With no role yet (still signing in) only the first item shows. */
export function navFor(role: Role | undefined): NavGroup[] {
  if (!role) return [];
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => can(role, i.feature)) }))
    .filter((g) => g.items.length > 0);
}

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);
