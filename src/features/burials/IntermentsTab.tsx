import { useMemo, useState } from 'react'
import {
  blockingRequirements,
  deceasedFullName,
  INTERMENT_STATUS_LABEL,
  INTERMENT_TYPE_LABEL,
  type Interment,
  type IntermentStatus,
  type IntermentType,
  type ISODate,
  type LocationId,
} from '@/domain'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import { IconBurials, IconScheduleBurial, IconSearch } from '@/components/ui-brand/icons'
import { fmtDate } from '@/lib/dates'
import { dataset, indexes, useDataset } from '@/stores/dataset'
import { requirementsProgress } from '@/stores/burials'
import { FIRST_INTERMENT } from '@/mock'
import {
  IntermentStatusChip,
  IntermentTypeBadge,
  RequirementsMeter,
  SlotIcon,
} from './bits'
import { DatePickerButton } from './ScheduleIntermentDialog'
import { lotCode, ownerName, slotLabelShort } from './helpers'

const ALL = '__all__'

/** The register the office keeps. */
export function IntermentsTab({
  locationId,
  canSchedule,
  onOpen,
  onSchedule,
}: {
  locationId: LocationId
  canSchedule: boolean
  onOpen: (i: Interment) => void
  onSchedule: () => void
}) {
  const version = useDataset((s) => s.version)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>(ALL)
  const [type, setType] = useState<string>(ALL)
  const [from, setFrom] = useState<ISODate | null>(null)
  const [to, setTo] = useState<ISODate | null>(null)
  const [outstandingOnly, setOutstandingOnly] = useState(false)

  const rows = useMemo(() => {
    void version
    const needle = q.trim().toLowerCase()
    return dataset()
      .interments.filter((i) => {
        if (i.locationId !== locationId) return false
        if (status !== ALL && i.status !== status) return false
        if (type !== ALL && i.type !== type) return false
        if (from && i.scheduledDate < from) return false
        if (to && i.scheduledDate > to) return false
        if (outstandingOnly && blockingRequirements(i).length === 0) return false
        if (needle) {
          const hay =
            `${deceasedFullName(i)} ${lotCode(i.lotId)} ${INTERMENT_TYPE_LABEL[i.type]}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        return true
      })
      .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1))
  }, [locationId, q, status, type, from, to, outstandingOnly, version])

  const columns: Column<Interment>[] = [
    {
      key: 'date',
      header: 'Date',
      width: '112px',
      sortBy: (r) => `${r.scheduledDate}${r.slot}`,
      cell: (r) => <span className="tabular text-ink">{fmtDate(r.scheduledDate)}</span>,
    },
    {
      key: 'slot',
      header: 'Slot',
      width: '62px',
      sortBy: (r) => r.slot,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <SlotIcon slot={r.slot} size={13} />
          <span className="font-mono text-[11.5px]">{slotLabelShort[r.slot]}</span>
        </span>
      ),
    },
    {
      key: 'deceased',
      header: 'Deceased',
      sortBy: (r) => r.deceasedLastName,
      cell: (r) => (
        <span className="font-medium text-ink">{deceasedFullName(r)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      width: '118px',
      sortBy: (r) => r.type,
      cell: (r) => <IntermentTypeBadge type={r.type} />,
    },
    {
      key: 'lot',
      header: 'Lot',
      width: '104px',
      sortBy: (r) => lotCode(r.lotId),
      cell: (r) => <span className="font-mono text-[12px]">{lotCode(r.lotId)}</span>,
    },
    {
      key: 'owner',
      header: 'Owner',
      cell: (r) => {
        const lot = indexes().lotsById.get(r.lotId)
        return (
          <span className="truncate text-muted">{lot ? ownerName(lot) : '—'}</span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '116px',
      sortBy: (r) => r.status,
      cell: (r) => <IntermentStatusChip status={r.status} />,
    },
    {
      key: 'requirements',
      header: 'Requirements',
      width: '130px',
      sortBy: (r) => requirementsProgress(r).done,
      cell: (r) => <RequirementsMeter interment={r} />,
    },
    {
      key: 'crew',
      header: 'Crew',
      width: '150px',
      cell: (r) => {
        const job = r.groundsJobId ? indexes().jobsById.get(r.groundsJobId) : null
        const name = job?.assignedToUserId
          ? indexes().usersById.get(job.assignedToUserId)?.fullName
          : null
        return name ? (
          <span className="truncate text-muted">{name}</span>
        ) : (
          <span className="text-[12px] text-muted/70">Unassigned</span>
        )
      },
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Icon
            icon={IconSearch}
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search deceased or lot…"
            className="h-8 w-[230px] pl-8 text-[13px]"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="w-[142px] text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(Object.keys(INTERMENT_STATUS_LABEL) as IntermentStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {INTERMENT_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={setType}>
          <SelectTrigger size="sm" className="w-[142px] text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {(Object.keys(INTERMENT_TYPE_LABEL) as IntermentType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {INTERMENT_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-[150px]">
          <DatePickerButton
            value={from}
            onChange={setFrom}
            placeholder="From"
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="w-[150px]">
          <DatePickerButton
            value={to}
            onChange={setTo}
            placeholder="To"
            className="h-8 text-[12.5px]"
          />
        </div>

        <Button
          variant={outstandingOnly ? 'default' : 'outline'}
          size="sm"
          className="h-8 text-[12.5px]"
          onClick={() => setOutstandingOnly((v) => !v)}
        >
          Requirements outstanding
        </Button>

        {(q || status !== ALL || type !== ALL || from || to || outstandingOnly) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12.5px] text-muted"
            onClick={() => {
              setQ('')
              setStatus(ALL)
              setType(ALL)
              setFrom(null)
              setTo(null)
              setOutstandingOnly(false)
            }}
          >
            Clear
          </Button>
        )}

        {canSchedule && (
          <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={onSchedule}>
            <Icon icon={IconScheduleBurial} size={15} />
            Schedule burial
          </Button>
        )}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={onOpen}
        emptyIcon={IconBurials}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty={{
          title: 'No interments match',
          body: `The register begins ${fmtDate(FIRST_INTERMENT)}, the park's first interment. Widen the filters to see more.`,
        }}
        footer={
          <span>
            <span className="tabular font-medium text-ink">{rows.length}</span> interment
            {rows.length === 1 ? '' : 's'} · the office register, oldest at the bottom.
          </span>
        }
      />
    </div>
  )
}
