import {
  LayoutDashboard,
  PackageCheck,
  ScrollText,
  UserSquare,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: UserSquare },
  { label: "Samples", href: "/samples", icon: PackageCheck },
  { label: "Team", href: "/team", icon: Users },
  { label: "Audit", href: "/audit", icon: ScrollText },
];
