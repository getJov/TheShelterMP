/**
 * Hugeicons-backed drop-in replacements for the handful of lucide icons
 * that shadcn/ui primitives import internally.
 *
 * The project uses Hugeicons Free everywhere; this shim means we never
 * install lucide-react while still being able to `npx shadcn add` new
 * primitives (just rewrite their import path to this module).
 *
 * Application code should NOT import from here — use `@/components/ui-brand/Icon`
 * and the semantic names in `@/components/ui-brand/icons`.
 */
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  CircleIcon as HuCircleIcon,
  MoreHorizontalIcon as HuMoreHorizontalIcon,
  Search01Icon,
  Tick02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Loading03Icon,
  CancelCircleIcon,
  Alert02Icon,
} from '@hugeicons/core-free-icons'
import type { ComponentPropsWithoutRef } from 'react'

type ShimProps = Omit<ComponentPropsWithoutRef<'svg'>, 'ref'> & {
  size?: string | number
  strokeWidth?: number
}

function make(icon: Parameters<typeof HugeiconsIcon>[0]['icon']) {
  return function Shim({ size = 16, strokeWidth = 1.7, ...rest }: ShimProps) {
    return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} {...rest} />
  }
}

export const CheckIcon = make(Tick02Icon)
export const ChevronDownIcon = make(ArrowDown01Icon)
export const ChevronUpIcon = make(ArrowUp01Icon)
export const ChevronRightIcon = make(ArrowRight01Icon)
export const ChevronLeftIcon = make(ArrowLeft01Icon)
export const ChevronRight = ChevronRightIcon
export const ChevronLeft = ChevronLeftIcon
export const XIcon = make(Cancel01Icon)
export const SearchIcon = make(Search01Icon)
export const CircleIcon = make(HuCircleIcon)
export const MoreHorizontal = make(HuMoreHorizontalIcon)
export const MoreHorizontalIcon = MoreHorizontal
export const MinusIcon = make(HuCircleIcon)

// Additional shims used by the sonner toaster.
export const CircleCheckIcon = make(CheckmarkCircle02Icon)
export const InfoIcon = make(InformationCircleIcon)
export const Loader2Icon = make(Loading03Icon)
export const OctagonXIcon = make(CancelCircleIcon)
export const TriangleAlertIcon = make(Alert02Icon)
