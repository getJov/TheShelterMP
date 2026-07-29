import { create } from 'zustand'
import { asId, type Client, type UserId } from '@/domain'
import { NOW, TODAY } from '@/mock'
import { record } from '@/lib/audit'
import { dataset, useDataset } from './dataset'

/**
 * Client book mutations. Same shape as the other feature stores: mutate the
 * shared dataset, rebuild indexes, and append an audit event.
 */

let clientSeq = 9000

const touch = () => useDataset.getState().touch()
const TBD = 'To be confirmed'

export interface CreateClientInput {
  firstName: string
  lastName: string
  phone: string
  middleName?: string | null
  suffix?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
}

export function nextClientRef(clients = dataset().clients): string {
  const year = TODAY.slice(0, 4)
  const prefix = `CL-${year}-`
  let max = 0

  for (const client of clients) {
    if (!client.clientRef.startsWith(prefix)) continue
    const n = Number(client.clientRef.slice(prefix.length))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }

  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function findClientByPhone(
  phone: string,
  clients = dataset().clients,
): Client | undefined {
  const digits = normalizePhone(phone)
  if (digits.length < 7) return undefined
  return clients.find((client) => normalizePhone(client.phone) === digits)
}

interface ClientsStore {
  version: number
  createClient: (input: CreateClientInput, actorId: UserId) => Client
}

export const useClients = create<ClientsStore>((set, get) => ({
  version: 0,

  createClient: (input, actorId) => {
    const firstName = input.firstName.trim()
    const lastName = input.lastName.trim()
    const phone = input.phone.trim()

    if (!firstName || !lastName || normalizePhone(phone).length < 7) {
      throw new Error('First name, last name and a valid phone are required.')
    }

    const client: Client = {
      id: asId<'Client'>(`cli_${++clientSeq}`),
      clientRef: nextClientRef(),
      firstName,
      middleName: input.middleName?.trim() || null,
      lastName,
      suffix: input.suffix?.trim() || null,
      email: input.email?.trim() || null,
      phone,
      address: input.address?.trim() || TBD,
      city: input.city?.trim() || TBD,
      province: input.province?.trim() || TBD,
      seniorCitizen: false,
      seniorCitizenId: null,
      idType: null,
      idNumber: null,
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
    }

    dataset().clients.push(client)
    touch()

    record(actorId, 'client.created', 'Client', client.id, null, {
      clientRef: client.clientRef,
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
    })

    set({ version: get().version + 1 })
    return client
  },
}))
