'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { RiskBadge, ConfidenceBadge, FindingCountBadges } from '@/components/severity-badge'
import { ExecutiveSummary } from '@/components/executive-summary'
import { FindingsPanel } from '@/components/findings-panel'
import { FindingDetail } from '@/components/finding-detail'
import { ActionBar } from '@/components/action-bar'
import { approveReview, rejectReview } from '@/lib/actions'
import type { PendingReview } from '@/lib/types'

interface ReviewDetailClientProps {
  review: PendingReview
}

export function ReviewDetailClient({ review }: ReviewDetailClientProps) {
  const router = useRouter()

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [activeFindingId, setActiveFindingId] = useState<number | null>(null)
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set())
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)

  const filteredFindings = useMemo(() => {
    return review.findings.filter(f => {
      if (severityFilter.size > 0 && !severityFilter.has(f.severity)) return false
      if (categoryFilter.size > 0 && !categoryFilter.has(f.category)) return false
      return true
    })
  }, [review.findings, severityFilter, categoryFilter])

  const activeFinding = review.findings.find(f => f.id === activeFindingId) ?? null

  const gitlabMrUrl = `${process.env.NEXT_PUBLIC_GITLAB_URL}/${process.env.NEXT_PUBLIC_GITLAB_NAMESPACE}/${process.env.NEXT_PUBLIC_GITLAB_PROJECT}/-/merge_requests/${review.mr_iid}`

  function handleSelectAll() {
    setSelectedIds(new Set(filteredFindings.map(f => f.id)))
  }

  function handleDeselectAll() {
    setSelectedIds(new Set())
  }

  function handleToggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleSelectFinding(id: number) {
    setActiveFindingId(id)
  }

  async function handleApproveSelected() {
    setIsApproving(true)
    try {
      const result = await approveReview(review.review_id, [...selectedIds])
      toast.success(`Approved ${result.posted_count ?? selectedIds.size} findings`)
      router.push('/reviews')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve findings')
    } finally {
      setIsApproving(false)
    }
  }

  async function handleApproveAll() {
    setIsApproving(true)
    try {
      const result = await approveReview(review.review_id, 'all')
      toast.success(`Approved all ${result.posted_count ?? review.findings.length} findings`)
      router.push('/reviews')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve findings')
    } finally {
      setIsApproving(false)
    }
  }

  async function handleRejectAll() {
    setIsRejecting(true)
    try {
      await rejectReview(review.review_id)
      toast.success('All findings rejected')
      router.push('/reviews')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject findings')
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b px-4 py-4 sm:px-6 space-y-3">
        {/* Row 1: Back arrow + MR info + badges */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <Link
              href="/reviews"
              className="grid size-8 place-items-center rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Back to review queue"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <a
              href={gitlabMrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-semibold tracking-tight hover:text-primary"
            >
              Merge request <span className="font-mono">!{review.mr_iid}</span>
            </a>
          </div>
          <div className="flex items-start gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Risk</span>
              <RiskBadge score={review.review_metadata.risk_score} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Confidence</span>
              <ConfidenceBadge score={review.confidence_score} className="text-base text-foreground leading-none" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Findings</span>
              <FindingCountBadges
                critical={review.stats.critical}
                high={review.stats.high}
                medium={review.stats.medium}
                low={review.stats.low}
              />
            </div>
          </div>
        </div>
        {/* Executive summary */}
        <ExecutiveSummary summary={review.review_metadata.executive_summary} />
      </div>

      {/* Two-panel split */}
      <div className="flex-1 grid grid-rows-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-1 md:grid-cols-[2fr_3fr] min-h-0">
        <div className="border-b md:border-b-0 md:border-r overflow-hidden bg-card/40">
          <FindingsPanel
            findings={filteredFindings}
            selectedIds={selectedIds}
            activeFindingId={activeFindingId}
            severityFilter={severityFilter}
            categoryFilter={categoryFilter}
            onToggleSelect={handleToggleSelect}
            onSelectFinding={handleSelectFinding}
            onSeverityFilterChange={setSeverityFilter}
            onCategoryFilterChange={setCategoryFilter}
          />
        </div>
        <div className="overflow-hidden">
          <FindingDetail finding={activeFinding} review={review} />
        </div>
      </div>

      {/* Sticky action bar */}
      <ActionBar
        selectedCount={selectedIds.size}
        totalCount={review.findings.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onApproveSelected={handleApproveSelected}
        onApproveAll={handleApproveAll}
        onRejectAll={handleRejectAll}
        isApproving={isApproving}
        isRejecting={isRejecting}
        reviewStatus={review.status}
      />
    </div>
  )
}
