/** Keep in step with backend/src/lib/creditRoles.ts. */
export const CREDIT_ROLES = ["composer", "lyrics", "vocals", "instrument", "field recording", "mixing", "mastering", "artwork"] as const;

/** "name (mixing, vocals)": the default credit (no roles, or only composer) shows the name alone. */
export function creditLabel(name: string, roles: string[] | undefined): string {
  const shown = (roles ?? []).filter((r) => r !== "composer");
  return shown.length ? `${name} (${shown.join(", ")})` : name;
}
