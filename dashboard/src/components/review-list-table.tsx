'use client'

import Link from 'next/link'
import { ChevronRight, Inbox } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  RiskBadge,
  ConfidenceBadge,
  FindingCountBadges,
} from '@/components/severity-badge'
import { cn } from '@/lib/utils'
import type { ReviewListItem } from '@/lib/types'

interface ReviewListTableProps {
  pendingReviews: ReviewListItem[]
  recentDecisions: Array<{
    review_id: string
    mr_iid: number
    project_id: number
    status: string
    approved_by: string | null
    rejected_by: string | null
    approved_at: string | null
    rejected_at: string | null
    created_at: string
  }>
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const seconds = Math.floor((now - then) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

function gitlabMrUrl(mrIid: number): string {
  const base = process.env.NEXT_PUBLIC_GITLAB_URL ?? ''
  const ns = process.env.NEXT_PUBLIC_GITLAB_NAMESPACE ?? ''
  const proj = process.env.NEXT_PUBLIC_GITLAB_PROJECT ?? ''
  return `${base}/${ns}/${proj}/-/merge_requests/${mrIid}`
}

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="size-5" />
      </span>
      <div>
        <p className="font-medium">No reviews waiting</p>
        <p className="mt-1 text-sm text-muted-foreground">
          New reviews appear here when a merge request is opened or updated.
        </p>
      </div>
    </div>
  )
}

export function ReviewListTable({
  pendingReviews,
  recentDecisions,
}: ReviewListTableProps) {
  if (pendingReviews.length === 0 && recentDecisions.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyQueue />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
          <h2 className="text-sm font-medium">
            Waiting for approval
            <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {pendingReviews.length}
            </span>
          </h2>
        </div>
        {pendingReviews.length === 0 ? (
          <EmptyQueue />
        ) : (
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 sm:pl-6 text-xs font-normal text-muted-foreground">MR</TableHead>
                  <TableHead className="text-xs font-normal text-muted-foreground">Risk</TableHead>
                  <TableHead className="text-xs font-normal text-muted-foreground">Findings</TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-normal text-muted-foreground">Confidence</TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-normal text-muted-foreground">Summary</TableHead>
                  <TableHead className="hidden sm:table-cell text-xs font-normal text-muted-foreground">Age</TableHead>
                  <TableHead className="pr-4 sm:pr-6 text-right text-xs font-normal text-muted-foreground">
                    <span className="sr-only">Action</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingReviews.map((review) => (
                  <TableRow key={review.review_id} className="group">
                    <TableCell className="pl-4 sm:pl-6 py-4">
                      <a
                        href={gitlabMrUrl(review.mr_iid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm font-medium hover:text-primary hover:underline underline-offset-4"
                      >
                        !{review.mr_iid}
                      </a>
                    </TableCell>
                    <TableCell className="py-4">
                      <RiskBadge score={review.risk_score} />
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="w-4 font-mono text-sm tabular-nums">
                          {review.total_findings}
                        </span>
                        <FindingCountBadges
                          critical={review.critical_findings}
                          high={review.high_findings}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell py-4">
                      <ConfidenceBadge score={review.confidence_score} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[420px] py-4 whitespace-normal">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p
                            dir="auto"
                            className="line-clamp-2 text-start text-sm leading-relaxed text-foreground/85 cursor-default"
                          >
                            {review.executive_summary}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm" dir="auto">
                          {review.executive_summary}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell py-4 text-sm text-muted-foreground whitespace-nowrap">
                      {timeAgo(review.created_at)}
                    </TableCell>
                    <TableCell className="pr-4 sm:pr-6 py-4 text-right">
                      <Button variant="outline" size="sm" asChild className="group-hover:border-primary/50">
                        <Link href={`/reviews/${review.review_id}`} aria-label={`Review MR !${review.mr_iid}`}>
                          <span className="hidden sm:inline">Review</span>
                          <ChevronRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </Card>

      {recentDecisions.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors select-none list-none flex items-center gap-2">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            Recent decisions ({recentDecisions.length})
          </summary>
          <Card className="mt-3 py-2">
            <CardContent className="px-4 sm:px-6">
              <ul className="divide-y">
                {recentDecisions.map((d) => (
                  <li
                    key={d.review_id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm"
                  >
                    <span className="font-mono font-medium">!{d.mr_iid}</span>
                    <Badge
                      className={cn(
                        'rounded-md capitalize',
                        d.status === 'approved'
                          ? 'bg-success/15 text-success border-success/30'
                          : 'bg-severity-critical/15 text-severity-critical border-severity-critical/30'
                      )}
                    >
                      {d.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      by {d.approved_by ?? d.rejected_by ?? 'unknown'}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {timeAgo(d.approved_at ?? d.rejected_at ?? d.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  )
}
