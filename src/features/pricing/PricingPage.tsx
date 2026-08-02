import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ISODate } from '@/domain'
import { TODAY } from '@/mock'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Icon } from '@/components/ui-brand/Icon'
import { IconVisible } from '@/components/ui-brand/icons'
import { useCanAny } from '@/lib/permissions'
import { AsOfControl } from './AsOfControl'
import { PriceBookTab } from './PriceBookTab'
import { LotTiersTab } from './LotTiersTab'
import { ServicesTab } from './ServicesTab'

type TabKey = 'book' | 'tiers' | 'services'

/**
 * "We can set the price at any given time."
 *
 * One date control at the top retimes the entire page — the matrix, the promo
 * banner, the tier cards and the calculator all resolve against it.
 */
export default function PricingPage() {
  const [asOf, setAsOf] = useState<ISODate>(TODAY)
  const [tab, setTab] = useState<TabKey>('book')
  const canWrite = useCanAny('price:manage', 'tier:manage', 'service:manage')

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1360px] p-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-1 text-gold-deep dark:text-gold">Manage</p>
            <h1 className="font-display text-[30px] font-semibold leading-tight text-ink">
              Pricing &amp; lot types
            </h1>
          </div>
          <AsOfControl value={asOf} onChange={setAsOf} />
        </header>

        {!canWrite && (
          <p className="mb-4 flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
            <Icon icon={IconVisible} size={15} />
            Read-only view. Pricing and lot types are maintained by an
            administrator.
          </p>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="mb-5">
            <TabsTrigger value="book">Price book</TabsTrigger>
            <TabsTrigger value="tiers">Lot types</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
          </TabsList>

          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <TabsContent value="book">
              {tab === 'book' && <PriceBookTab asOf={asOf} />}
            </TabsContent>
            <TabsContent value="tiers">
              {tab === 'tiers' && (
                <LotTiersTab asOf={asOf} onViewPrices={() => setTab('book')} />
              )}
            </TabsContent>
            <TabsContent value="services">
              {tab === 'services' && <ServicesTab />}
            </TabsContent>
          </motion.div>
        </Tabs>
      </div>
    </div>
  )
}
