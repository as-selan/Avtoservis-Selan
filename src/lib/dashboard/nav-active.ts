/** Active state for sidebar items. /dashboard must not match child routes. */
export function isAvailableNavActive(
  pathname: string,
  item: { available: boolean; href?: string },
): boolean {
  if (!item.available || !item.href) {
    return false;
  }
  if (item.href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
