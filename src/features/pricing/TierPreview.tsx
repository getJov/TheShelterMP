import { useEffect, useRef } from 'react'
import { STATUS_APPEARANCE, STATUS_BADGE, type LotStatus, type TierAppearance } from '@/domain'
import { cn } from '@/lib/utils'

/**
 * A live preview of one lot painted at this tier's appearance, with a sample
 * status badge on top — the exact combination the client's map design rests
 * on, so an appearance edit can be judged before it reaches the park.
 *
 * TODO(14): unify with map canvas — spec 05 has not landed a shared polygon
 * renderer in `@/features/map` yet. When it does, delete drawLot() below and
 * import that draw code so the preview cannot drift from what the map shows.
 */

export function drawLot(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number
    y: number
    w: number
    h: number
    appearance: TierAppearance
    status: LotStatus | null
    showLabel: boolean
    scale: number
  },
) {
  const { x, y, w, h, appearance, status, showLabel, scale } = opts

  ctx.save()

  // ── body ───────────────────────────────────────────────────────
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.fillStyle = appearance.fillColor
  ctx.fill()

  // ── pattern, clipped to the polygon ────────────────────────────
  if (appearance.pattern !== 'none') {
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = appearance.strokeColor
    ctx.globalAlpha = 0.5
    ctx.lineWidth = Math.max(1, scale * 0.7)

    if (appearance.pattern === 'diagonal' || appearance.pattern === 'cross') {
      for (let i = -h; i < w + h; i += 7 * scale) {
        ctx.beginPath()
        ctx.moveTo(x + i, y)
        ctx.lineTo(x + i + h, y + h)
        ctx.stroke()
      }
    }
    if (appearance.pattern === 'cross') {
      for (let i = -h; i < w + h; i += 7 * scale) {
        ctx.beginPath()
        ctx.moveTo(x + i, y + h)
        ctx.lineTo(x + i + h, y)
        ctx.stroke()
      }
    }
    if (appearance.pattern === 'dots') {
      ctx.fillStyle = appearance.strokeColor
      for (let gx = 4 * scale; gx < w; gx += 7 * scale) {
        for (let gy = 4 * scale; gy < h; gy += 7 * scale) {
          ctx.beginPath()
          ctx.arc(x + gx, y + gy, 1.1 * scale, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    ctx.restore()
  }

  // ── stroke ─────────────────────────────────────────────────────
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.strokeStyle = appearance.strokeColor
  // strokeWidth is metres-ish on the map; multiply so it reads at this size.
  ctx.lineWidth = Math.max(1, appearance.strokeWidth * 2 * scale)
  ctx.stroke()

  // ── short label ────────────────────────────────────────────────
  if (showLabel && appearance.shortLabel) {
    ctx.fillStyle = 'rgba(28,26,21,0.62)'
    ctx.font = `600 ${Math.round(10 * scale)}px "DM Sans", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(appearance.shortLabel, x + w / 2, y + h / 2)
  }

  // ── status badge, at the polygon's top-left vertex ─────────────
  if (status) {
    const a = STATUS_APPEARANCE[status]
    const r = STATUS_BADGE.radiusPx * scale
    const bx = x + STATUS_BADGE.offset.x * scale
    const by = y + STATUS_BADGE.offset.y * scale

    ctx.beginPath()
    ctx.arc(bx, by, r, 0, Math.PI * 2)
    ctx.fillStyle = a.color
    ctx.fill()
    ctx.lineWidth = 1.2 * scale
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${Math.round(STATUS_BADGE.fontPx * scale)}px "DM Sans", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(a.letter, bx, by + 0.5 * scale)
  }

  ctx.restore()
}

export function TierPreview({
  appearance,
  widthM,
  lengthM,
  status = 'available',
  width = 132,
  height = 88,
  className,
}: {
  appearance: TierAppearance
  widthM: number
  lengthM: number
  status?: LotStatus | null
  width?: number
  height?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // Keep the real footprint's aspect ratio — a family garden must look
    // like a family garden next to a lawn lot.
    const pad = 10
    const availW = width - pad * 2
    const availH = height - pad * 2
    const ratio = widthM / lengthM
    let w = availH * ratio
    let h = availH
    if (w > availW) {
      w = availW
      h = availW / ratio
    }
    drawLot(ctx, {
      x: (width - w) / 2,
      y: (height - h) / 2,
      w,
      h,
      appearance,
      status,
      showLabel: true,
      scale: 1,
    })
  }, [
    appearance.fillColor,
    appearance.strokeColor,
    appearance.strokeWidth,
    appearance.pattern,
    appearance.shortLabel,
    widthM,
    lengthM,
    status,
    width,
    height,
    appearance,
  ])

  return (
    <canvas
      ref={ref}
      style={{ width, height }}
      className={cn(
        'rounded-md border border-line-soft bg-surface-2',
        className,
      )}
      aria-label="Lot appearance preview"
    />
  )
}

/** The small square used in the price-book rows and legends. */
export function TierSwatch({
  appearance,
  size = 14,
  className,
}: {
  appearance: TierAppearance
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn('inline-block shrink-0 rounded-[3px]', className)}
      style={{
        width: size,
        height: size,
        background: appearance.fillColor,
        border: `1.5px solid ${appearance.strokeColor}`,
      }}
    />
  )
}
