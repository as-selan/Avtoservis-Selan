import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  LayoutDashboard,
  Plug,
  Users,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  /** Linked items are implemented. Unavailable items stay visible as "Kmalu". */
  available: boolean;
}

export const APP_NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Nadzorna plošča",
    href: "/dashboard",
    icon: LayoutDashboard,
    available: true,
  },
  {
    id: "service-orders",
    label: "Potek popravil",
    href: "/dashboard/nalogi",
    icon: ClipboardList,
    available: true,
  },
  {
    id: "customers",
    label: "Kontakti primerov",
    href: "/dashboard/stranke",
    icon: Users,
    available: true,
  },
  {
    id: "integrations",
    label: "Quibi",
    href: "/dashboard/quibi",
    icon: Plug,
    available: true,
  },
];
