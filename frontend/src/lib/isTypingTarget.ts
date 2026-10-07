export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

const ACTIVATES_WITH_SPACE = 'button, a[href], select, summary, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="treeitem"], [role="option"], [role="slider"], audio[controls], video[controls]';
const USES_ARROWS = 'select, [role="radio"], [role="slider"], [role="tab"], [role="menuitem"], [role="treeitem"], [role="option"], [role="listbox"], audio[controls], video[controls], input[type="range"], input[type="radio"], input[type="checkbox"]';

/** Focus is on something that uses the Space key itself (a button, a checkbox, a dropdown ...): a global Space shortcut must leave it alone. */
export function usesSpaceItself(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.matches(ACTIVATES_WITH_SPACE) || !!el.closest('[role="radiogroup"], [role="listbox"], [role="tablist"], [role="menu"]'));
}
/** Focus is on something that moves with the arrow keys itself (a radio group, a slider, a dropdown ...): global arrow shortcuts must leave it alone. */
export function usesArrowsItself(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.matches(USES_ARROWS) || !!el.closest('[role="radiogroup"], [role="listbox"], [role="tablist"], [role="menu"]'));
}
