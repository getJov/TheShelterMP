import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ASSUMPTIONS,
  type ServiceCatalogItem,
  type ServiceCategory,
} from '@/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icon } from '@/components/ui-brand/Icon'
import { IconAdd, IconArchive, IconEdit, IconService } from '@/components/ui-brand/icons'
import { AssumedChip } from '@/components/ui-brand/AssumedChip'
import { DataTable, type Column } from '@/components/ui-brand/DataTable'
import { MoneyText } from '@/components/ui-brand/MoneyText'
import { SectionHeading } from '@/components/ui-brand/SectionHeading'
import { formatCount, parsePeso } from '@/lib/money'
import { useCan } from '@/lib/permissions'
import { usePricing } from '@/stores/pricing'

const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  interment: 'Interment',
  maintenance: 'Maintenance',
  environmental: 'Environmental',
  transfer: 'Transfer',
  other: 'Other',
}

const BILLING_LABEL: Record<ServiceCatalogItem['billing'], string> = {
  per_contract: 'Per contract',
  per_interment: 'Per interment',
  recurring_annual: 'Annual',
}

export function ServicesTab() {
  const canManage = useCan('service:manage')
  const catalogVersion = usePricing((s) => s.catalogVersion)
  const services = usePricing((s) => s.services)()
  const serviceUsage = usePricing((s) => s.serviceUsage)
  const archiveService = usePricing((s) => s.archiveService)
  void catalogVersion

  const [editing, setEditing] = useState<ServiceCatalogItem | null>(null)
  const [open, setOpen] = useState(false)

  const columns: Column<ServiceCatalogItem>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (s) => <span className="font-mono text-[12px]">{s.code}</span>,
      sortBy: (s) => s.code,
      width: '150px',
    },
    {
      key: 'name',
      header: 'Service',
      cell: (s) => <span className="font-medium text-ink">{s.name}</span>,
      sortBy: (s) => s.name,
    },
    {
      key: 'category',
      header: 'Category',
      cell: (s) => (
        <Badge variant="outline" className="text-[11px]">
          {CATEGORY_LABEL[s.category]}
        </Badge>
      ),
      sortBy: (s) => s.category,
      width: '140px',
    },
    {
      key: 'amount',
      header: 'Default amount',
      align: 'right',
      width: '170px',
      sortBy: (s) => s.defaultAmountCentavos,
      cell: (s) => (
        <span className="inline-flex items-center gap-1.5">
          <MoneyText centavos={s.defaultAmountCentavos} />
          <AssumedChip why={ASSUMPTIONS.serviceFees.why} />
        </span>
      ),
    },
    {
      key: 'billing',
      header: 'Billing',
      cell: (s) => <span className="text-muted">{BILLING_LABEL[s.billing]}</span>,
      sortBy: (s) => s.billing,
      width: '130px',
    },
    {
      key: 'usage',
      header: 'Used on',
      align: 'right',
      width: '110px',
      sortBy: (s) => serviceUsage(s.id),
      cell: (s) => {
        const n = serviceUsage(s.id)
        return n === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <span>{formatCount(n)} lines</span>
        )
      },
    },
    {
      key: 'active',
      header: 'Status',
      width: '110px',
      cell: (s) =>
        s.active ? (
          <Badge variant="outline" className="border-green/60 text-green">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted">
            Archived
          </Badge>
        ),
      sortBy: (s) => (s.active ? 0 : 1),
    },
  ]

  if (canManage) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      width: '92px',
      cell: (s) => (
        <span className="flex justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted"
            aria-label="Edit service"
            onClick={() => {
              setEditing(s)
              setOpen(true)
            }}
          >
            <Icon icon={IconEdit} size={14} />
          </Button>
          {s.active && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted"
              aria-label="Archive service"
              onClick={() => {
                archiveService(s.id)
                toast.success(`${s.name} archived`, {
                  description: 'Signed contracts keep their service amounts.',
                })
              }}
            >
              <Icon icon={IconArchive} size={14} />
            </Button>
          )}
        </span>
      ),
    })
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Catalog"
        title="Services"
        action={
          canManage ? (
            <Button
              className="gap-1.5"
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Icon icon={IconAdd} size={15} />
              New service
            </Button>
          ) : undefined
        }
      />

      <DataTable
        rows={services}
        columns={columns}
        rowKey={(s) => s.id}
        emptyIcon={IconService}
        initialSort={{ key: 'name', dir: 'asc' }}
      />

      {canManage && (
        <ServiceDialog open={open} onOpenChange={setOpen} service={editing} />
      )}
    </div>
  )
}

function ServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  service: ServiceCatalogItem | null
}) {
  const createService = usePricing((s) => s.createService)
  const updateService = usePricing((s) => s.updateService)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ServiceCategory>('interment')
  const [amountText, setAmountText] = useState('')
  const [billing, setBilling] = useState<ServiceCatalogItem['billing']>('per_contract')
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (!open) return
    setCode(service?.code ?? '')
    setName(service?.name ?? '')
    setCategory(service?.category ?? 'interment')
    setAmountText(
      service ? String(service.defaultAmountCentavos / 100) : '',
    )
    setBilling(service?.billing ?? 'per_contract')
    setActive(service?.active ?? true)
  }, [open, service])

  const amount = parsePeso(amountText)
  const valid = code.trim() && name.trim() && amount !== null && amount >= 0

  function submit() {
    if (!valid || amount === null) return
    if (service) {
      updateService(service.id, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        category,
        defaultAmountCentavos: amount,
        billing,
        active,
      })
      toast.success(`${name.trim()} updated`)
    } else {
      createService({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        category,
        defaultAmountCentavos: amount,
        billing,
        active,
        note: ASSUMPTIONS.serviceFees.why,
      })
      toast.success(`${name.trim()} added to the catalog`)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{service ? `Edit ${service.name}` : 'New service'}</DialogTitle>
          <DialogDescription>
            Archiving a service keeps historical service lines and signed contract
            amounts intact.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="eyebrow mb-1.5 block text-muted">Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono text-[12px]"
              placeholder="OPEN_CLOSE"
            />
          </div>
          <div>
            <Label className="eyebrow mb-1.5 block text-muted">Default amount</Label>
            <Input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="decimal"
              className="tabular"
              placeholder="₱8,000"
            />
          </div>
          <div className="col-span-2">
            <Label className="eyebrow mb-1.5 block text-muted">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="eyebrow mb-1.5 block text-muted">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ServiceCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABEL) as ServiceCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="eyebrow mb-1.5 block text-muted">Billing</Label>
            <Select
              value={billing}
              onValueChange={(v) => setBilling(v as ServiceCatalogItem['billing'])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(BILLING_LABEL) as ServiceCatalogItem['billing'][]).map(
                  (b) => (
                    <SelectItem key={b} value={b}>
                      {BILLING_LABEL[b]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2">
            <span className="text-[13px]">Active in the catalog</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {service ? 'Save changes' : 'Add service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
