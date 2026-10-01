export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { ReviewListTable } from '@/components/review-list-table'
import type { ReviewListItem } from '@/lib/types'

export default async function ReviewsPage() {
  const supabase = await createClient()

  const { data: pendingData } = await supabase
    .from('active_reviews_dashboard')
    .select('*')

  const pendingReviews = (pendingData ?? []) as ReviewListItem[]

  const { data: decisionsData } = await supabase
    .from('pending_reviews')
    .select(
      'review_id, mr_iid, project_id, status, approved_by, rejected_by, approved_at, rejected_at, created_at'
    )
    .in('status', ['approved', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(10)

  const recentDecisions = decisionsData ?? []

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          Findings from the review agents wait here. No inline comment reaches the merge request until you approve it.
        </p>
      </div>
      <ReviewListTable
        pendingReviews={pendingReviews}
        recentDecisions={recentDecisions}
      />
    </div>
  )
}
