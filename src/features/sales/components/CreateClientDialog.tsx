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
  const [submitError, setSubmitError] = useState<string | null>(null)

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
    setSubmitError(null)
  }, [open, initialName])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSubmitError(null)
    setForm((state) => ({ ...state, [key]: value }))
  }

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
    setSubmitError(null)
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
      const message = error instanceof Error ? error.message : 'Could not create client.'
      setSubmitError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]">
        <DialogHeader className="shrink-0 border-b border-line px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="font-display text-section-title">New client</DialogTitle>
          <DialogDescription>
            Name and phone are enough to hold a lot or open a contract. Address can be
            filled in later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain px-4 py-4 sm:grid-cols-2 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="nc-first" className="text-caption text-muted">
              First name
            </Label>
            <Input
              id="nc-first"
              value={form.firstName}
              onChange={(event) => set('firstName', event.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-last" className="text-caption text-muted">
              Last name
            </Label>
            <Input
              id="nc-last"
              value={form.lastName}
              onChange={(event) => set('lastName', event.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nc-phone" className="text-caption text-muted">
              Mobile phone
            </Label>
            <Input
              id="nc-phone"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              inputMode="tel"
              placeholder="09XX XXX XXXX"
              required
              aria-invalid={form.phone.length > 0 && normalizePhone(form.phone).length < 7}
              aria-describedby="nc-phone-help"
            />
            <p id="nc-phone-help" className="text-caption text-muted">
              Enter at least seven digits.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-city" className="text-caption text-muted">
              City <span className="text-muted/70">(optional)</span>
            </Label>
            <Input
              id="nc-city"
              value={form.city}
              onChange={(event) => set('city', event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-address" className="text-caption text-muted">
              Address <span className="text-muted/70">(optional)</span>
            </Label>
            <Input
              id="nc-address"
              value={form.address}
              onChange={(event) => set('address', event.target.value)}
            />
          </div>
        </div>

        {submitError && (
          <p role="alert" className="mx-4 rounded-md border border-danger/40 bg-danger/8 p-3 text-body text-danger sm:mx-6">
            {submitError}
          </p>
        )}

        <DialogFooter className="shrink-0 flex-col border-t border-line px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:px-6">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-11 sm:h-9"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSave || busy || !user}
            className="h-11 sm:h-9"
          >
            Create client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
