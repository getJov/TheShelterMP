import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PARK_FACTS, ROLE_LABEL, type Role, type User } from '@/domain'
import { useDataset } from '@/stores/dataset'
import { useSession } from '@/stores/session'
import { LogoLockup, LogoMark } from '@/components/shell/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

const DEMO_ORDER: Role[] = ['owner', 'admin', 'manager', 'agent']

export default function LoginPage() {
  const data = useDataset((s) => s.data)
  const signIn = useSession((s) => s.signIn)
  const navigate = useNavigate()

  const demo = useMemo(() => {
    const pick = (role: Role) => {
      const candidates = data.users.filter(
        (u) => u.role === role && u.status === 'active',
      )
      if (role !== 'agent') return candidates[0]!
      // The client's story is a rank-and-file counsellor, not a distributor —
      // so the demo agent is the first ASSOCIATE, whose restricted view is
      // what the walkthrough actually contrasts against a manager's.
      const associate = candidates.find(
        (u) =>
          data.agents.find((a) => a.id === u.agentProfileId)?.level === 'associate',
      )
      return associate ?? candidates[0]!
    }
    return DEMO_ORDER.map(pick)
  }, [data.users, data.agents])

  const archived = useMemo(
    () => data.users.find((u) => u.status === 'archived') ?? null,
    [data.users],
  )

  const [selected, setSelected] = useState<string>(demo[0]!.id)
  const [email, setEmail] = useState(demo[0]!.email)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const locationName = (u: User) =>
    u.locationIds.length === 0
      ? 'All locations'
      : (data.locations.find((l) => l.id === u.locationIds[0])?.name ?? '—')

  function onSelect(id: string) {
    setSelected(id)
    const u = [...demo, ...(archived ? [archived] : [])].find((x) => x.id === id)
    if (u) setEmail(u.email)
    setError(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Enter an email and password to continue.')
      return
    }
    setBusy(true)
    const ok = signIn(selected as User['id'])
    if (!ok) {
      setBusy(false)
      setError('This account has been archived. Contact an administrator.')
      return
    }
    navigate('/map', { replace: true })
  }

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-[46%] lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[380px]"
        >
          <LogoLockup />

          <h1 className="mt-10 font-display text-[34px] font-semibold leading-tight text-ink">
            Welcome back
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            Sign in to the operations platform.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[12.5px] text-muted">
                Email
              </Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[12.5px] text-muted">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter any password"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[12.5px] text-danger"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-9">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="eyebrow text-muted">Demo accounts</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <RadioGroup value={selected} onValueChange={onSelect} className="gap-2">
              {demo.map((u, i) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.16 + i * 0.04, duration: 0.3 }}
                >
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      selected === u.id
                        ? 'border-gold bg-gold/8'
                        : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <RadioGroupItem value={u.id} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink">
                        {u.fullName}
                      </div>
                      <div className="truncate text-[11.5px] text-muted">
                        {ROLE_LABEL[u.role]} · {locationName(u)}
                      </div>
                    </div>
                  </label>
                </motion.div>
              ))}

              {archived && (
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors',
                    selected === archived.id
                      ? 'border-danger bg-danger/6'
                      : 'border-line hover:bg-surface-2',
                  )}
                >
                  <RadioGroupItem value={archived.id} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-muted">
                      {archived.fullName}
                    </div>
                    <div className="truncate text-[11.5px] text-muted">
                      Archived agent — shows the lockout path
                    </div>
                  </div>
                </label>
              )}
            </RadioGroup>
          </div>

          <p className="mt-8 text-[11.5px] leading-relaxed text-muted">
            Select an account and enter any password to sign in.
          </p>
        </motion.div>
      </div>

      {/* brand panel — deliberately dark in both themes; it is imagery, not chrome */}
      <div className="relative hidden overflow-hidden lg:block lg:w-[54%]" style={{ background: '#070d0b' }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 70% 20%, rgba(201,169,98,0.16), transparent 60%), radial-gradient(90% 70% at 20% 80%, rgba(74,124,89,0.22), transparent 65%)',
          }}
        />
        <motion.div
          className="absolute inset-0 grid place-items-center"
          animate={{ y: [0, -14, 0], opacity: [0.16, 0.22, 0.16] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        >
          <LogoMark size={460} className="text-[#c9a962]" />
        </motion.div>

        <div className="absolute inset-x-0 bottom-0 p-14">
          <p
            className="max-w-[22ch] font-display text-[38px] leading-[1.12]"
            style={{ color: '#e8e4dc' }}
          >
            {PARK_FACTS.tagline}
          </p>
          <p className="mt-5 text-[13px]" style={{ color: '#9aa89e' }}>
            {PARK_FACTS.corporateName}
            <br />
            Lupon, Davao Oriental
          </p>
        </div>
      </div>
    </div>
  )
}
