export const ROLES = ["manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

// Public registration creates manager accounts. Admin access can only be granted
// by an existing admin through the Users screen or protected registration API.
export const PUBLIC_ROLES = ["manager"] as const;
export type PublicRole = (typeof PUBLIC_ROLES)[number];
