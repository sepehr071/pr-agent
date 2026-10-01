'use client'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SeverityBadge } from '@/components/severity-badge'
import { cn } from '@/lib/utils'
import { FileCode2, MousePointerClick } from 'lucide-react'
import type { Finding, PendingReview } from '@/lib/types'

interface FindingDetailProps {
  finding: Finding | null
  review: PendingReview
}

const confidenceColors: Record<string, string> = {
  high: 'border-success/40 text-success',
  medium: 'border-severity-medium/40 text-severity-medium',
  low: 'border-severity-critical/40 text-severity-critical',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-medium text-muted-foreground mb-2">
      {children}
    </h4>
  )
}

function renderSuggestion(suggestion: string) {
  // Split on triple-backtick code blocks
  const parts = suggestion.split(/(```[\s\S]*?```)/g)

  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      // Remove the ``` markers and optional language tag
      const content = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
      return (
        <pre
          key={i}
          className="my-2 rounded-md border bg-background/60 p-3 font-mono text-xs leading-relaxed overflow-x-auto" dir="ltr"
        >
          <code>{content}</code>
        </pre>
      )
    }
    if (!part.trim()) return null
    return (
      <span key={i} className="whitespace-pre-wrap" dir="auto">
        {part}
      </span>
    )
  })
}

function extractCweNumber(cweId: string): string | null {
  const match = cweId.match(/(\d+)/)
  return match ? match[1] : null
}

export function FindingDetail({ finding, review }: FindingDetailProps) {
  if (!finding) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <MousePointerClick className="size-5" />
        </span>
        <p className="text-muted-foreground text-sm">
          Select a finding from the list to view details
        </p>
      </div>
    )
  }

  const gitlabUrl = process.env.NEXT_PUBLIC_GITLAB_URL ?? ''
  const gitlabNamespace = process.env.NEXT_PUBLIC_GITLAB_NAMESPACE ?? ''
  const gitlabProject = process.env.NEXT_PUBLIC_GITLAB_PROJECT ?? ''
  const fileUrl = `${gitlabUrl}/${gitlabNamespace}/${gitlabProject}/-/blob/${review.head_sha}/${finding.file_path}#L${finding.line}`

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8 sm:py-6 space-y-5 [&>*]:max-w-3xl">
      {/* Header */}
      <div>
        <div className="flex items-start gap-2 mb-2">
          <span className="font-mono text-lg text-muted-foreground leading-tight">#{finding.id}</span>
          <h2 className="text-xl font-semibold leading-tight tracking-tight" dir="auto">{finding.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <Badge variant="outline" className="rounded-md">{finding.category}</Badge>
          <Badge variant="secondary" className="rounded-md font-mono text-[11px]">
            {finding.subcategory}
          </Badge>
          <Badge
            variant="outline"
            className={cn('rounded-md text-xs', confidenceColors[finding.confidence])}
          >
            {finding.confidence} confidence
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Location */}
      <div>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-2.5 py-1.5 font-mono text-xs text-primary hover:border-primary/50"
          dir="ltr"
        >
          <FileCode2 className="size-3.5" /> {finding.file_path}:{finding.line}
        </a>
      </div>

      <Separator />

      {/* Description */}
      <div>
        <SectionLabel>Description</SectionLabel>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90" dir="auto">{finding.description}</p>
      </div>

      <Separator />

      {/* Suggestion */}
      <div>
        <SectionLabel>Suggestion</SectionLabel>
        <div className="text-sm">{renderSuggestion(finding.suggestion)}</div>
      </div>

      {/* Category-specific fields */}
      {finding.cwe_id && (
        <>
          <Separator />
          <div>
            <SectionLabel>CWE</SectionLabel>
            {(() => {
              const num = extractCweNumber(finding.cwe_id!)
              if (num) {
                return (
                  <a
                    href={`https://cwe.mitre.org/data/definitions/${num}.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline underline-offset-4"
                  >
                    {finding.cwe_id}
                  </a>
                )
              }
              return <span className="text-sm">{finding.cwe_id}</span>
            })()}
          </div>
        </>
      )}

      {finding.impact && (
        <>
          <Separator />
          <div>
            <SectionLabel>Impact</SectionLabel>
            <p className="text-sm">{finding.impact}</p>
          </div>
        </>
      )}

      {finding.auto_fixable !== undefined && (
        <>
          <Separator />
          <div>
            <SectionLabel>Auto-fixable</SectionLabel>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                finding.auto_fixable
                  ? 'border-success/40 text-success'
                  : 'border-border text-muted-foreground'
              )}
            >
              {finding.auto_fixable ? 'Yes' : 'No'}
            </Badge>
          </div>
        </>
      )}

      {finding.test_example && (
        <>
          <Separator />
          <div>
            <SectionLabel>Test Example</SectionLabel>
            <pre className="rounded-md border bg-background/60 p-3 font-mono text-xs leading-relaxed overflow-x-auto" dir="ltr">
              <code>{finding.test_example}</code>
            </pre>
          </div>
        </>
      )}

      {finding.metrics && (
        <>
          <Separator />
          <div>
            <SectionLabel>Metrics</SectionLabel>
            <p className="text-sm">{finding.metrics}</p>
          </div>
        </>
      )}

      {finding.related_files && finding.related_files.length > 0 && (
        <>
          <Separator />
          <div>
            <SectionLabel>Related Files</SectionLabel>
            <ul className="space-y-0.5">
              {finding.related_files.map((file, i) => (
                <li key={i} className="font-mono text-xs text-muted-foreground">
                  {file}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
