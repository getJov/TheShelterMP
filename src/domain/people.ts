import type { AgentId, ClientId, LocationId, UserId } from './ids'
import type { Centavos, ISODate, ISODateTime } from './primitives'
import type { CommissionLevel, Role, UserStatus } from './enums'

export interface User {
  id: UserId
  fullName: string
  email: string
  role: Role
  status: UserStatus
  /**
   * Scope. owner/admin: every location, represented as [].
   * manager: exactly one. agent: exactly one.
   */
  locationIds: LocationId[]
  /** Present only when role === 'agent'. */
  agentProfileId: AgentId | null
  avatarUrl: string | null
  phone: string | null
  lastLoginAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface AgentProfile {
  id: AgentId
  userId: UserId
  agentCode: string // 'AG-014'
  level: CommissionLevel
  /** Upline. Drives the 6/4/2 split. Null at the top. */
  teamLeaderId: AgentId | null
  distributorId: AgentId | null
  locationId: LocationId
  hiredAt: ISODate
  status: UserStatus
  /** Archiving revokes access but preserves attribution — client's rule. */
  archivedAt: ISODateTime | null
  archiveReason: string | null
  monthlyTargetCentavos: Centavos | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Client {
  id: ClientId
  /**
   * Display reference. NOTE: the client's "unique reference number" is per
   * CONTRACT, not per client — see Contract.contractNo.
   */
  clientRef: string // 'CL-2026-0184'
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  email: string | null
  phone: string
  address: string
  city: string
  province: string
  /** Flag only — no discount rule is defined. See ASSUMPTIONS. */
  seniorCitizen: boolean
  seniorCitizenId: string | null
  idType: string | null
  idNumber: string | null
  notes: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export const clientFullName = (c: Client) =>
  [c.firstName, c.middleName, c.lastName, c.suffix].filter(Boolean).join(' ')
