import { useMemo, useState } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  MAX_BURIALS_PER_DAY,
  type BurialSlot,
  type Interment,
  type IntermentId,
  type ISODate,
  type Location,
} from '@/domain'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui-brand/EmptyState'
import { SectionHeading } from '@/components/ui-brand/SectionHeading'
import { Icon } from '@/components/ui-brand/Icon'
import { IconBurials, IconLocation, IconWarning } from '@/components/ui-brand/icons'
import { fmtDate } from '@/lib/dates'
import { useActiveLocation, useCan } from '@/lib/permissions'
import { dataset, useDataset } from '@/stores/dataset'
import { lateUnassignedJobs, upcomingInterments } from '@/stores/burials'
import { FIRST_INTERMENT } from '@/mock'
import { CalendarTab } from './CalendarTab'
import { IntermentsTab } from './IntermentsTab'
import { GroundsJobsTab } from './GroundsJobsTab'
import { IntermentSheet } from './IntermentSheet'
import { ScheduleIntermentDialog } from './ScheduleIntermentDialog'

type Tab = 'calendar' | 'interments' | 'jobs'

export default function BurialsPage() {
  return (
    <Routes>
      <Route index element={<BurialsShell tab="calendar" />} />
      <Route path="jobs" element={<BurialsShell tab="jobs" />} />
      <Route path="interments" element={<BurialsShell tab="interments" />} />
      <Route path=":id" element={<BurialsShell tab="calendar" />} />
      <Route path="*" element={<Navigate to="/burials" replace />} />
    </Routes>
  )
}

const TAB_PATH: Record<Tab, string> = {
  calendar: '/burials',
  interments: '/burials/interments',
  jobs: '/burials/jobs',
}

function BurialsShell({ tab }: { tab: Tab }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const version = useDataset((s) => s.version)
  const active = useActiveLocation()
  const canSchedule = useCan('interment:schedule')
  const canManageJobs = useCan('job:manage')

  const [sheetId, setSheetId] = useState<IntermentId | null>(null)
  const [dialog, setDialog] = useState<{
    open: boolean
    date: ISODate | null
    slot: BurialSlot | null
  }>({ open: false, date: null, slot: null })

  // owner/admin may be looking at "all locations"; interments only happen at
  // a park, so fall back to one rather than showing nothing.
  const park: Location | null = useMemo(() => {
    void version
    if (active) return active
    return dataset().locations.find((l) => l.kind === 'park') ?? null
  }, [active, version])

  const openId = (id as IntermentId | undefined) ?? sheetId

  const stats = useMemo(() => {
    void version
    if (!park || park.kind !== 'park') return null
    return {
      upcoming: upcomingInterments(30, park.id).length,
      flagged: lateUnassignedJobs(park.id).length,
    }
  }, [park, version])

  if (!park) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <EmptyState
          icon={IconLocation}
          title="No location selected"
          body="Choose a location from the switcher to see its burial calendar."
        />
      </div>
    )
  }

  // The Townsite office is a sales_office. An empty calendar there would be a
  // lie of omission — nothing is ever scheduled at a sales office.
  if (park.kind !== 'park') {
    return (
      <div className="h-full overflow-y-auto p-6">
        <EmptyState
          icon={IconLocation}
          title="Interments are held at the park"
          body={`${park.name} is a sales office. Burials, grounds jobs and the day sheets all belong to the memorial park — switch location to see the calendar.`}
        />
      </div>
    )
  }

  const openInterment = (i: Interment) => setSheetId(i.id)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1360px] space-y-4 p-5">
        <SectionHeading
          eyebrow={park.name}
          title="Burials & Grounds"
          size="lg"
          action={
            stats && stats.flagged > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-gold text-gold-deep dark:text-gold"
                onClick={() => navigate(TAB_PATH.jobs)}
              >
                <Icon icon={IconWarning} size={15} />
                {stats.flagged} unassigned job{stats.flagged === 1 ? '' : 's'} within 3 days
              </Button>
            ) : null
          }
        />

        <p className="max-w-[78ch] text-[13px] leading-relaxed text-muted">
          A day holds {MAX_BURIALS_PER_DAY} services — one morning, one afternoon —
          and that ceiling is enforced, not advised. The park's first interment was{' '}
          {fmtDate(FIRST_INTERMENT)}.
        </p>

        <Tabs value={tab} onValueChange={(v) => navigate(TAB_PATH[v as Tab])}>
          <TabsList>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="interments">Interments</TabsTrigger>
            <TabsTrigger value="jobs">
              Grounds Jobs
              {stats && stats.flagged > 0 && (
                <span className="ml-1.5 grid min-w-[16px] place-items-center rounded-full bg-gold px-1 text-[10px] font-bold leading-4 text-black">
                  {stats.flagged}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'calendar' && (
          <CalendarTab
            locationId={park.id}
            canSchedule={canSchedule}
            canManageJobs={canManageJobs}
            onOpenInterment={openInterment}
            onSchedule={(date, slot) => setDialog({ open: true, date, slot })}
          />
        )}

        {tab === 'interments' && (
          <IntermentsTab
            locationId={park.id}
            canSchedule={canSchedule}
            onOpen={openInterment}
            onSchedule={() => setDialog({ open: true, date: null, slot: null })}
          />
        )}

        {tab === 'jobs' && (
          <GroundsJobsTab
            locationId={park.id}
            canManageJobs={canManageJobs}
            onOpenInterment={openInterment}
          />
        )}

        {!stats?.upcoming && tab === 'calendar' && (
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <Icon icon={IconBurials} size={14} />
            Nothing is booked in the next 30 days.
          </p>
        )}
      </div>

      <IntermentSheet
        intermentId={openId}
        onOpenChange={(v) => {
          if (!v) {
            setSheetId(null)
            if (id) navigate(TAB_PATH.calendar, { replace: true })
          }
        }}
        onOpenJobs={() => {
          setSheetId(null)
          navigate(TAB_PATH.jobs)
        }}
      />

      <ScheduleIntermentDialog
        open={dialog.open}
        onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
        locationId={park.id}
        presetDate={dialog.date}
        presetSlot={dialog.slot}
        onScheduled={(newId) => setSheetId(newId)}
      />
    </div>
  )
}
