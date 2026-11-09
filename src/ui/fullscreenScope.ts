export function isRightDrawer(drawer: Element | null): boolean {
  if (!drawer) return false;
  if (drawer.classList.contains("mod-left")) return false;
  return true;
}

export interface DrawerRect {
  width: number;
  height: number;
  left: number;
  right: number;
}

export function isDrawerOnScreen(
  r: DrawerRect,
  viewportWidth: number
): boolean {
  if (r.width <= 0 || r.height <= 0) return false;
  const visibleWidth = Math.min(r.right, viewportWidth) - Math.max(r.left, 0);
  return visibleWidth >= r.width / 2;
}

export function fullscreenOn(settingOn: boolean, chatOpen: boolean): boolean {
  return settingOn || chatOpen;
}

export function isChatScreen(root: Element | null): boolean {
  return !!root?.classList.contains("corvus-chat-open");
}
