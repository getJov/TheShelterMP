import {
  asId,
  toCentavos,
  type AgentId,
  type AgentProfile,
  type Client,
  type LocationId,
  type User,
} from '@/domain'
import type { Rng } from './rng'
import { NOW } from './time'
import {
  ARCHIVE_REASONS,
  BARANGAYS,
  FEMALE_FIRST,
  ID_TYPES,
  MALE_FIRST,
  MIDDLE_INITIALS,
  MUNICIPALITIES,
  STREET_TYPES,
  SURNAMES,
} from './names'
import { LOC_ILANGAY, LOC_TOWNSITE } from './seed-catalog'

const t = { createdAt: NOW, updatedAt: NOW }

export interface PeopleSeed {
  users: User[]
  agents: AgentProfile[]
  clients: Client[]
  adminId: ReturnType<typeof asId<'User'>>
  ownerId: ReturnType<typeof asId<'User'>>
  managerIlangayId: ReturnType<typeof asId<'User'>>
  crewIds: ReturnType<typeof asId<'User'>>[]
}

/** Fixed staff so the login screen's demo accounts never shift. */
const STAFF: {
  key: string
  name: string
  role: User['role']
  loc: LocationId | null
}[] = [
  { key: 'owner', name: 'Wendy M. Rabina', role: 'owner', loc: null },
  { key: 'admin1', name: 'Judith C. Montero', role: 'admin', loc: null },
  { key: 'admin2', name: 'Ferdinand L. Amistoso', role: 'admin', loc: null },
  { key: 'mgr_ilg', name: 'Josefina R. Bacaltos', role: 'manager', loc: LOC_ILANGAY },
  { key: 'mgr_twn', name: 'Eduardo P. Gempesaw', role: 'manager', loc: LOC_TOWNSITE },
  { key: 'crew1', name: 'Rolando T. Malinao', role: 'manager', loc: LOC_ILANGAY },
]

interface AgentSpec {
  key: string
  name: string
  level: AgentProfile['level']
  upline?: string
  loc: LocationId
  archived?: boolean
  target: number | null
}

/**
 * Every selling agent is bound to the PARK, not the sales office. All 904 lots
 * are at Ilangay, and lotVisibility() hides out-of-scope lots — so an agent
 * bound to Townsite would open a completely blank map.
 *
 * Location scoping is still demonstrated by the two managers: Josefina is
 * bound to the park, Eduardo to the Townsite office (whose map correctly shows
 * the "no park layout for this location" empty state).
 */
const AGENTS: AgentSpec[] = [
  // distributors
  { key: 'ag01', name: 'Elena V. Maglasang', level: 'distributor', loc: LOC_ILANGAY, target: 900_000 },
  { key: 'ag02', name: 'Bienvenido S. Cagas', level: 'distributor', loc: LOC_ILANGAY, target: 750_000 },
  // team leaders
  { key: 'ag03', name: 'Ronaldo M. Sabtal', level: 'team_leader', upline: 'ag01', loc: LOC_ILANGAY, target: 600_000 },
  { key: 'ag04', name: 'Corazon B. Villanueva', level: 'team_leader', upline: 'ag01', loc: LOC_ILANGAY, target: 520_000 },
  { key: 'ag05', name: 'Danilo F. Obenza', level: 'team_leader', upline: 'ag02', loc: LOC_ILANGAY, target: 480_000 },
  // associates
  { key: 'ag06', name: 'Grace A. Delos Reyes', level: 'associate', upline: 'ag03', loc: LOC_ILANGAY, target: 450_000 },
  { key: 'ag07', name: 'Marlon T. Cabahug', level: 'associate', upline: 'ag03', loc: LOC_ILANGAY, target: 300_000 },
  { key: 'ag08', name: 'Rosalinda V. Ocampo', level: 'associate', upline: 'ag03', loc: LOC_ILANGAY, target: 280_000 },
  { key: 'ag09', name: 'Nestor D. Padernal', level: 'associate', upline: 'ag04', loc: LOC_ILANGAY, target: 260_000 },
  { key: 'ag10', name: 'Milagros E. Suico', level: 'associate', upline: 'ag04', loc: LOC_ILANGAY, target: 240_000 },
  { key: 'ag11', name: 'Arnel G. Tabanao', level: 'associate', upline: 'ag04', loc: LOC_ILANGAY, target: null },
  { key: 'ag12', name: 'Perlita N. Ronquillo', level: 'associate', upline: 'ag05', loc: LOC_ILANGAY, target: 220_000 },
  { key: 'ag13', name: 'Virgilio A. Lacaba', level: 'associate', upline: 'ag05', loc: LOC_ILANGAY, archived: true, target: null },
  { key: 'ag14', name: 'Norma L. Hinlo', level: 'associate', upline: 'ag02', loc: LOC_ILANGAY, archived: true, target: 180_000 },
]

const slug = (n: string) =>
  n
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(-1)[0]

export function seedPeople(rng: Rng): PeopleSeed {
  const users: User[] = []
  const agents: AgentProfile[] = []
  const userIdOf = new Map<string, ReturnType<typeof asId<'User'>>>()
  const agentIdOf = new Map<string, AgentId>()

  // staff
  STAFF.forEach((s, i) => {
    const id = asId<'User'>(`usr_${String(i + 1).padStart(3, '0')}`)
    userIdOf.set(s.key, id)
    users.push({
      id,
      fullName: s.name,
      email: `${slug(s.name)}@sheltermemorialpark.ph`,
      role: s.role,
      status: 'active',
      locationIds: s.loc ? [s.loc] : [],
      agentProfileId: null,
      avatarUrl: null,
      phone: `0930 ${rng.int(200, 899)} ${rng.int(1000, 9999)}`,
      lastLoginAt: NOW,
      ...t,
    })
  })

  // agents — users first so ids are stable, then profiles
  AGENTS.forEach((a, i) => {
    const uid = asId<'User'>(`usr_${String(STAFF.length + i + 1).padStart(3, '0')}`)
    const aid = asId<'Agent'>(`agt_${String(i + 1).padStart(3, '0')}`)
    userIdOf.set(a.key, uid)
    agentIdOf.set(a.key, aid)
    users.push({
      id: uid,
      fullName: a.name,
      email: `${slug(a.name)}${i}@sheltermemorialpark.ph`,
      role: 'agent',
      status: a.archived ? 'archived' : 'active',
      locationIds: [a.loc],
      agentProfileId: aid,
      avatarUrl: null,
      phone: `0917 ${rng.int(200, 899)} ${rng.int(1000, 9999)}`,
      lastLoginAt: a.archived ? null : NOW,
      ...t,
    })
  })

  AGENTS.forEach((a, i) => {
    const upline = a.upline ? AGENTS.find((x) => x.key === a.upline) : undefined
    const teamLeaderId =
      upline && upline.level === 'team_leader' ? agentIdOf.get(upline.key)! : null
    const distributorId = upline
      ? upline.level === 'distributor'
        ? agentIdOf.get(upline.key)!
        : agentIdOf.get(upline.upline!) ?? null
      : null

    agents.push({
      id: agentIdOf.get(a.key)!,
      userId: userIdOf.get(a.key)!,
      agentCode: `AG-${String(i + 1).padStart(3, '0')}`,
      level: a.level,
      teamLeaderId,
      distributorId,
      locationId: a.loc,
      hiredAt: `202${rng.int(4, 5)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
      status: a.archived ? 'archived' : 'active',
      archivedAt: a.archived ? '2026-05-20T10:00:00+08:00' : null,
      archiveReason: a.archived ? rng.pick(ARCHIVE_REASONS) : null,
      monthlyTargetCentavos: a.target ? toCentavos(a.target) : null,
      ...t,
    })
  })

  // clients
  const clients: Client[] = []
  const municipalityWeights = MUNICIPALITIES.map(
    (m) => [m, m.weight] as [(typeof MUNICIPALITIES)[number], number],
  )

  for (let i = 0; i < 190; i++) {
    const female = rng.bool(0.52)
    const first = rng.pick(female ? FEMALE_FIRST : MALE_FIRST)
    const last = rng.pick(SURNAMES)
    const muni = rng.weighted(municipalityWeights)
    const senior = rng.bool(0.18)
    const year = rng.weighted([
      ['2024', 1],
      ['2025', 3],
      ['2026', 5],
    ] as const)

    clients.push({
      id: asId<'Client'>(`cli_${String(i + 1).padStart(4, '0')}`),
      clientRef: `CL-${year}-${String(i + 1).padStart(4, '0')}`,
      firstName: first,
      middleName: rng.pick(MIDDLE_INITIALS) + '.',
      lastName: last,
      suffix: rng.bool(0.05) ? rng.pick(['Jr.', 'Sr.', 'III']) : null,
      email: rng.bool(0.6)
        ? `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@gmail.com`
        : null,
      phone: `09${rng.int(15, 99)} ${rng.int(200, 899)} ${rng.int(1000, 9999)}`,
      address: `${rng.pick(STREET_TYPES)} ${rng.int(1, 9)}, Brgy. ${rng.pick(BARANGAYS)}`,
      city: muni.city,
      province: muni.province,
      seniorCitizen: senior,
      seniorCitizenId: senior ? `SC-${rng.int(10000, 99999)}` : null,
      idType: rng.pick(ID_TYPES),
      idNumber: `${rng.int(1000, 9999)}-${rng.int(1000, 9999)}-${rng.int(1000, 9999)}`,
      notes: null,
      ...t,
    })
  }

  return {
    users,
    agents,
    clients,
    adminId: userIdOf.get('admin1')!,
    ownerId: userIdOf.get('owner')!,
    managerIlangayId: userIdOf.get('mgr_ilg')!,
    crewIds: [userIdOf.get('crew1')!, userIdOf.get('mgr_ilg')!],
  }
}
