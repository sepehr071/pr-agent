import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Severity } from '@/lib/types'

// Tinted "signal" chips: colour carries severity, text stays readable on the dark ground.
export const severityChip: Record<Severity, string> = {
  critical: 'bg-severity-critical/15 text-severity-critical border-severity-critical/35',
  high: 'bg-severity-high/15 text-severity-high border-severity-high/35',
  medium: 'bg-severity-medium/12 text-severity-medium border-severity-medium/30',
  low: 'bg-severity-low/15 text-severity-low border-severity-low/30',
}

export const severityDot: Record<Severity, string> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
}

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity
  className?: string
}) {
  return (
    <Badge className={cn('rounded-md capitalize', severityChip[severity], className)}>
      <span className={cn('size-1.5 rounded-full', severityDot[severity])} />
      {severity}
    </Badge>
  )
}

function riskTone(score: number): { text: string; bar: string } {
  if (score < 20) return { text: 'text-success', bar: 'bg-success' }
  if (score < 40) return { text: 'text-severity-medium', bar: 'bg-severity-medium' }
  if (score < 70) return { text: 'text-severity-high', bar: 'bg-severity-high' }
  return { text: 'text-severity-critical', bar: 'bg-severity-critical' }
}

// Risk score as a number plus a thin meter, so the queue can be scanned by eye.
export function RiskBadge({
  score,
  className,
  size = 'sm',
}: {
  score: number
  className?: string
  size?: 'sm' | 'lg'
}) {
  const tone = riskTone(score)
  return (
    <span
      className={cn('inline-flex flex-col gap-1', size === 'lg' ? 'w-28' : 'w-20', className)}
      title={`Risk ${score} of 100`}
    >
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            'font-mono font-medium tabular-nums leading-none',
            size === 'lg' ? 'text-2xl' : 'text-base',
            tone.text
          )}
        >
          {score}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground leading-none">/100</span>
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-full rounded-full', tone.bar)} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </span>
    </span>
  )
}

export function ConfidenceBadge({
  score,
  className,
}: {
  score: number
  className?: string
}) {
  return (
    <span className={cn('font-mono text-sm tabular-nums text-muted-foreground', className)}>
      {score}%
    </span>
  )
}

const severityAbbr: Record<Severity, string> = {
  critical: 'C',
  high: 'H',
  medium: 'M',
  low: 'L',
}

export function FindingCountBadges({
  critical,
  high,
  medium,
  low,
}: {
  critical: number
  high: number
  medium?: number
  low?: number
}) {
  const counts = ([
    { severity: 'critical' as Severity, count: critical },
    { severity: 'high' as Severity, count: high },
    { severity: 'medium' as Severity, count: medium ?? 0 },
    { severity: 'low' as Severity, count: low ?? 0 },
  ] satisfies { severity: Severity; count: number }[]).filter((entry) => entry.count > 0)

  return (
    <span className="inline-flex items-center gap-1">
      {counts.map(({ severity, count }) => (
        <Badge
          key={severity}
          title={`${count} ${severity}`}
          className={cn(
            severityChip[severity],
            'rounded-md px-1.5 py-0 font-mono text-[11px] leading-5 font-medium'
          )}
        >
          {count}
          {severityAbbr[severity]}
        </Badge>
      ))}
    </span>
  )
}
