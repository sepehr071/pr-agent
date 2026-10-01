export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { ReviewDetailClient } from '@/components/review-detail-client'
import type { PendingReview, Finding, ReviewStats, ReviewMetadata, CustomComment } from '@/lib/types'
import Link from 'next/link'

// Helper to safely parse JSONB fields (may come as string or object)
function parseJsonField<T>(field: unknown, fallback: T): T {
  if (field === null || field === undefined) return fallback
  if (typeof field === 'string') {
    try { return JSON.parse(field) as T } catch { return fallback }
  }
  return field as T
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('pending_reviews')
    .select('*')
    .eq('review_id', id)
    .single()

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <p className="text-muted-foreground">Review not found</p>
        <Link href="/reviews" className="text-sm underline">&larr; Back to reviews</Link>
      </div>
    )
  }

  // Parse JSONB fields
  const review: PendingReview = {
    ...data,
    findings: parseJsonField<Finding[]>(data.findings, []),
    stats: parseJsonField<ReviewStats>(data.stats, { total: 0, critical: 0, high: 0, medium: 0, low: 0, by_category: {} }),
    review_metadata: parseJsonField<ReviewMetadata>(data.review_metadata, { risk_score: 0, executive_summary: '', model: '', languages: [] }),
    custom_comments: parseJsonField<CustomComment[]>(data.custom_comments, []),
  }

  return <ReviewDetailClient review={review} />
}
