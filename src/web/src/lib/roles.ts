import type { Role } from '../api/types'

/** Roles that can open the web dashboard. Reps work in the mobile app. */
export const dashboardRoles: Role[] = ['AreaManager', 'RegionalManager', 'NationalSalesManager', 'Executive', 'Admin', 'Marketing', 'KeyAccountManager']

/** Mirrors the API's `Roles.Managers`: may read team data, users, audit log and sample reports. */
export const isManager = (r: Role) => ['AreaManager', 'RegionalManager', 'NationalSalesManager', 'Executive', 'Admin'].includes(r)

/** Create users, territories and batches; issue stock. */
export const isAdmin = (r: Role) => r === 'Admin' || r === 'NationalSalesManager'

/** May approve or reject sample requests (for people in their reporting line). */
export const canApproveSamples = (r: Role) => ['AreaManager', 'RegionalManager', 'NationalSalesManager', 'Admin'].includes(r)

export const canImportCustomers = (r: Role) => ['AreaManager', 'RegionalManager', 'NationalSalesManager', 'Admin'].includes(r)

export const canUseDashboard = (r: Role) => dashboardRoles.includes(r)

/** The ERP integration pages: administrators manage them, executives can see them. */
export const canSeeErp = (r: Role) => ['Admin', 'NationalSalesManager', 'Executive'].includes(r)
