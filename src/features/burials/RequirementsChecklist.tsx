import type { IntermentRequirements, IntermentType } from '@/domain'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { requirementKeys } from '@/stores/burials'

const REQUIREMENT_META: Record<
  keyof IntermentRequirements,
  { label: string; blocking: boolean; hint: string }
> = {
  deathCertificate: {
    label: 'Death certificate',
    blocking: true,
    hint: 'Required for every interment.',
  },
  burialPermit: {
    label: 'Burial permit',
    blocking: true,
    hint: 'Required for every interment. Often arrives after the date is set.',
  },
  transferPermit: {
    label: 'Transfer permit',
    blocking: true,
    hint: 'Bone transfers only.',
  },
  ownerConsent: {
    label: 'Owner consent',
    blocking: false,
    hint: 'Needed when the deceased is not the lot owner. Warning only.',
  },
  feesSettled: {
    label: 'Fees settled',
    blocking: false,
    hint: 'Opening & closing fee paid. Warning only.',
  },
}

/**
 * An interment can be SCHEDULED with items outstanding — that is how it
 * really works, the permit usually lands after the date. It cannot be
 * COMPLETED until the blocking ones are ticked.
 */
export function RequirementsChecklist({
  type,
  requirements,
  editable,
  onToggle,
  idPrefix,
  className,
}: {
  type: IntermentType
  requirements: IntermentRequirements
  editable: boolean
  onToggle: (key: keyof IntermentRequirements, next: boolean) => void
  idPrefix: string
  className?: string
}) {
  const keys = requirementKeys(type)
  return (
    <ul className={cn('divide-y divide-line-soft rounded-lg border border-line', className)}>
      {keys.map((key) => {
        const meta = REQUIREMENT_META[key]
        const done = requirements[key]
        const id = `${idPrefix}-${key}`
        return (
          <li key={key} className="flex items-start gap-3 px-3 py-2.5">
            <Checkbox
              id={id}
              checked={done}
              disabled={!editable}
              onCheckedChange={(v) => onToggle(key, v === true)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <Label
                htmlFor={id}
                className={cn(
                  'text-[13px] font-medium',
                  done ? 'text-ink' : 'text-ink',
                  !editable && 'cursor-default',
                )}
              >
                {meta.label}
                {meta.blocking ? (
                  <span className="eyebrow ml-2 rounded border border-danger/40 bg-danger/8 px-1 py-px text-[9px] text-danger">
                    Blocks completion
                  </span>
                ) : (
                  <span className="eyebrow ml-2 text-[9px] text-muted">Warning only</span>
                )}
              </Label>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{meta.hint}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export { REQUIREMENT_META }
