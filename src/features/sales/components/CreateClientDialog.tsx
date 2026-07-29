import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { clientFullName, type ClientId } from '@/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentUserOrNull } from '@/lib/permissions'
import { findClientByPhone, normalizePhone, useClients } from '@/stores/clients'

interface FormState {
  firstName: string
  lastName: string
  phone: string
  city: string
  address: string
}

const blank = (): FormState => ({
  firstName: '',
  lastName: '',
  phone: '',
  city: '',
  address: '',
})

/**
 * Compact client creation for sales flows. Full KYC stays in the client record;
 * this captures enough to hold a lot or open a contract for a walk-in.
 */
export function CreateClientDialog({
  open,
  onOpenChange,
  onCreated,
  initialName = '',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (clientId: ClientId) => void
  initialName?: string
}) {
  const user = useCurrentUserOrNull()
  const createClient = useClients((s) => s.createClient)
  const [form, setForm] = useState<FormState>(blank)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return

    const parts = initialName.trim().split(/\s+/).filter(Boolean)
    const next = blank()
    if (parts.length === 1) {
      next.firstName = parts[0]!
    } else if (parts.length > 1) {
      next.firstName = parts.slice(0, -1).join(' ')
      next.lastName = parts[parts.length - 1]!
    }

    setForm(next)
    setBusy(false)
  }, [open, initialName])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((state) => ({ ...state, [key]: value }))

  const canSave =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    normalizePhone(form.phone).length >= 7

  function submit() {
    if (!user || !canSave) return

    const duplicate = findClientByPhone(form.phone)
    if (duplicate) {
      toast.warning(`Phone matches ${clientFullName(duplicate)}; creating anyway.`)
    }

    setBusy(true)
    try {
      const created = createClient(
        {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          city: form.city || null,
          address: form.address || null,
        },
        user.id,
      )

      toast.success(`${clientFullName(created)} added to the client book.`, {
        description: created.clientRef,
      })
      onCreated(created.id)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create client.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[22px]">New client</DialogTitle>
          <DialogDescription>
            Name and phone are enough to hold a lot or open a contract. Address can be
            filled in later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nc-first" className="text-[12.5px] text-muted">
              First name
            </Label>
            <Input
              id="nc-first"
              value={form.firstName}
              onChange={(event) => set('firstName', event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-last" className="text-[12.5px] text-muted">
              Last name
            </Label>
            <Input
              id="nc-last"
              value={form.lastName}
              onChange={(event) => set('lastName', event.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nc-phone" className="text-[12.5px] text-muted">
              Mobile phone
            </Label>
            <Input
              id="nc-phone"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              inputMode="tel"
              placeholder="09XX XXX XXXX"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-city" className="text-[12.5px] text-muted">
              City <span className="text-muted/70">(optional)</span>
            </Label>
            <Input
              id="nc-city"
              value={form.city}
              onChange={(event) => set('city', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-address" className="text-[12.5px] text-muted">
              Address <span className="text-muted/70">(optional)</span>
            </Label>
            <Input
              id="nc-address"
              value={form.address}
              onChange={(event) => set('address', event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSave || busy || !user}>
            Create client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
