'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Finding, Category } from '@/lib/types'
import { Shield, Gauge, Palette, Boxes, FlaskConical, Sparkles, BookOpen, type LucideIcon } from 'lucide-react'
import { SeverityBadge, severityChip } from '@/components/severity-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

interface FindingsPanelProps {
  findings: Finding[]
  selectedIds: Set<number>
  activeFindingId: number | null
  severityFilter: Set<string>
  categoryFilter: Set<string>
  onToggleSelect: (id: number) => void
  onSelectFinding: (id: number) => void
  onSeverityFilterChange: (severities: Set<string>) => void
  onCategoryFilterChange: (categories: Set<string>) => void
}

const severities = ['critical', 'high', 'medium', 'low'] as const

const severityBorderColors: Record<string, string> = {
  critical: 'border-l-severity-critical',
  high: 'border-l-severity-high',
  medium: 'border-l-severity-medium',
  low: 'border-l-severity-low',
}

const categoryIcons: Record<Category, LucideIcon> = {
  security: Shield,
  performance: Gauge,
  style: Palette,
  architecture: Boxes,
  'test-coverage': FlaskConical,
  'code-quality': Sparkles,
  context: BookOpen,
}

function CategoryIcon({ category }: { category: Category }) {
  const Icon = categoryIcons[category]
  return Icon ? <Icon className="size-3.5" /> : null
}

export function FindingsPanel({
  findings,
  selectedIds,
  activeFindingId,
  severityFilter,
  categoryFilter,
  onToggleSelect,
  onSelectFinding,
  onSeverityFilterChange,
  onCategoryFilterChange,
}: FindingsPanelProps) {
  const availableCategories = useMemo(() => {
    const cats = new Set<Category>()
    for (const f of findings) cats.add(f.category)
    return Array.from(cats)
  }, [findings])

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter.size > 0 && !severityFilter.has(f.severity)) return false
      if (categoryFilter.size > 0 && !categoryFilter.has(f.category)) return false
      return true
    })
  }, [findings, severityFilter, categoryFilter])

  function toggleSeverity(sev: string) {
    const next = new Set(severityFilter)
    if (next.has(sev)) {
      next.delete(sev)
    } else {
      next.add(sev)
    }
    onSeverityFilterChange(next)
  }

  function toggleCategory(cat: string) {
    const next = new Set(categoryFilter)
    if (next.has(cat)) {
      next.delete(cat)
    } else {
      next.add(cat)
    }
    onCategoryFilterChange(next)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex-shrink-0 space-y-2 px-3 py-3 sm:px-4">
        {/* Severity filters */}
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={severityFilter.size === 0 ? 'default' : 'outline'}
            onClick={() => onSeverityFilterChange(new Set())}
            className="h-7 text-xs"
          >
            All
          </Button>
          {severities.map((sev) => (
            <Button
              key={sev}
              size="sm"
              variant="outline"
              onClick={() => toggleSeverity(sev)}
              className={cn(
                'h-7 text-xs capitalize',
                severityFilter.has(sev) && severityChip[sev]
              )}
            >
              {sev}
            </Button>
          ))}
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap items-center gap-1">
          {availableCategories.map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={categoryFilter.has(cat) ? 'default' : 'outline'}
              onClick={() => toggleCategory(cat)}
              className="h-7 text-xs"
            >
              <CategoryIcon category={cat} />
              {cat}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Finding cards list */}
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="space-y-0.5 p-2">
          {filteredFindings.map((finding) => (
            <div
              key={finding.id}
              data-finding={finding.id}
              className={cn(
                'flex items-start gap-3 rounded-md border-l-2 px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent/50',
                severityBorderColors[finding.severity],
                activeFindingId === finding.id && 'bg-accent ring-1 ring-inset ring-primary/30'
              )}
              onClick={() => onSelectFinding(finding.id)}
            >
              <div
                className="pt-0.5"
                onClick={(e) => {
                  e.stopPropagation()
                }}
              >
                <Checkbox
                  checked={selectedIds.has(finding.id)}
                  onCheckedChange={() => onToggleSelect(finding.id)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{finding.id}
                  </span>
                  <SeverityBadge
                    severity={finding.severity}
                    className="px-1.5 py-0 text-[10px] leading-4"
                  />
                  <span className="text-xs text-muted-foreground">
                    {finding.category}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
                  {finding.file_path}:{finding.line}
                </div>
                <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug" dir="auto">{finding.title}</div>
              </div>
            </div>
          ))}
          {filteredFindings.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No findings match the current filters.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
