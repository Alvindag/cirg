import type { DB, User } from "./model";
import type { IdClaims } from "./auth";
import { logAudit, save } from "./store";

export type Resolved = { user: User } | { error: string };

/**
 * Finds the person who signed in. Nobody is created from a Microsoft sign-in:
 * an administrator adds people first (Team page), by their Microsoft email.
 * The one exception is the bootstrap admin, so a fresh install has someone who can.
 * The first sign-in binds the Microsoft account id to the person; after that the
 * id is what counts, so reusing or reassigning an email address does not hand over the account.
 */
export function resolveEntraUser(db: DB, claims: IdClaims, bootstrapAdminEmail?: string): Resolved {
  const byOid = db.users.find((u) => u.entraOid === claims.oid);
  let user = byOid ?? db.users.find((u) => u.email.toLowerCase() === claims.email && !u.entraOid);
  if (!user && db.users.some((u) => u.email.toLowerCase() === claims.email && u.entraOid && u.entraOid !== claims.oid)) {
    return { error: "This email is already linked to a different Microsoft account." };
  }
  if (!user && bootstrapAdminEmail && claims.email === bootstrapAdminEmail && !db.users.some((u) => u.role === "Admin" && u.isActive && u.entraOid)) {
    user = {
      id: `user-${Date.now().toString(36)}`,
      tenantId: db.users[0]?.tenantId ?? "tenant-0001",
      fullName: claims.name ?? claims.email,
      email: claims.email,
      role: "Admin",
      territoryId: null,
      externalId: `entra-${claims.oid}`,
      managerId: null,
      isActive: true,
      distributorId: null,
    };
    db.users.push(user);
    logAudit(user.id, "Create", "User", user.id, { role: "Admin", via: "bootstrap" });
  }
  if (!user) return { error: "Your Microsoft account is not set up in DAS Engage 360. Ask an administrator to add your work email." };
  if (!user.isActive) return { error: "This account has been deactivated." };
  if (!user.entraOid) {
    user.entraOid = claims.oid;
    logAudit(user.id, "Link", "User", user.id, { via: "first sign-in" });
  }
  save();
  return { user };
}
