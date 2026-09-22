import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarDays,
  Car,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  Plug,
  Settings,
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
    label: "Servisni nalogi",
    icon: ClipboardList,
    available: false,
  },
  {
    id: "inquiries",
    label: "Povpraševanja",
    icon: Inbox,
    available: false,
  },
  {
    id: "appointments",
    label: "Termini",
    icon: CalendarDays,
    available: false,
  },
  {
    id: "offers",
    label: "Ponudbe",
    icon: FileText,
    available: false,
  },
  {
    id: "customers",
    label: "Stranke",
    href: "/dashboard/stranke",
    icon: Users,
    available: true,
  },
  {
    id: "vehicles",
    label: "Vozila",
    icon: Car,
    available: false,
  },
  {
    id: "activity",
    label: "Aktivnost",
    icon: Activity,
    available: false,
  },
  {
    id: "integrations",
    label: "Integracije",
    icon: Plug,
    available: false,
  },
  {
    id: "settings",
    label: "Nastavitve",
    icon: Settings,
    available: false,
  },
];
