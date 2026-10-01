'use client'

import { createClient } from '@/lib/supabase/client'
import type { ApproveResponse, RejectResponse } from '@/lib/types'

export async function approveReview(
  reviewId: string,
  selectedFindingIds: number[] | 'all'
): Promise<ApproveResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase.functions.invoke('approve-review', {
    body: {
      review_id: reviewId,
      selected_finding_ids: selectedFindingIds,
      approver: user?.email ?? 'unknown'
    }
  })

  if (error) throw new Error(error.message)
  return data as ApproveResponse
}

export async function rejectReview(
  reviewId: string
): Promise<RejectResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase.functions.invoke('reject-review', {
    body: {
      review_id: reviewId,
      rejector: user?.email ?? 'unknown'
    }
  })

  if (error) throw new Error(error.message)
  return data as RejectResponse
}
