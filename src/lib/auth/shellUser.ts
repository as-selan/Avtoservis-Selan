import type { Phase1OperationalRole } from "@/lib/auth/requireWorkshopAccess";

export type DashboardShellUser = {
  displayName: string;
  role: string;
  initials: string;
};

const ROLE_LABELS: Record<Phase1OperationalRole, string> = {
  owner: "Lastnik",
  admin: "Administrator",
  reception: "Recepcija",
};

export function roleLabel(role: Phase1OperationalRole): string {
  return ROLE_LABELS[role];
}

export function initialsFromDisplayName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toLocaleUpperCase("sl-SI");
  }
  const first = parts[0].slice(0, 1);
  const last = parts[parts.length - 1].slice(0, 1);
  return `${first}${last}`.toLocaleUpperCase("sl-SI");
}

export function shortNameFromDisplayName(displayName: string): string {
  const first = displayName.trim().split(/\s+/).filter(Boolean)[0];
  return first || displayName;
}
