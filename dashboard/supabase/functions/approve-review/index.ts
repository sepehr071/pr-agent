import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ---------- Auth ----------
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    // ---------- Parse request ----------
    const { review_id, selected_finding_ids, approver } = await req.json()

    if (!review_id) {
      return jsonResponse({ error: 'review_id is required' }, 400)
    }
    if (!selected_finding_ids) {
      return jsonResponse({ error: 'selected_finding_ids is required' }, 400)
    }
    if (!approver) {
      return jsonResponse({ error: 'approver is required' }, 400)
    }

    // ---------- 1. Fetch review ----------
    const { data: review, error: fetchError } = await supabase
      .from('pending_reviews')
      .select('*')
      .eq('review_id', review_id)
      .single()

    if (fetchError || !review) {
      return jsonResponse({ error: 'Review not found' }, 404)
    }

    if (review.status !== 'pending_approval') {
      return jsonResponse(
        { error: 'Review is not in pending_approval status' },
        409,
      )
    }

    // ---------- 2. Parse findings ----------
    const allFindings: any[] =
      typeof review.findings === 'string'
        ? JSON.parse(review.findings)
        : review.findings

    const customComments: any[] =
      typeof review.custom_comments === 'string'
        ? JSON.parse(review.custom_comments)
        : review.custom_comments || []

    // ---------- 3. Filter to selected findings ----------
    const selectedFindings =
      selected_finding_ids === 'all'
        ? allFindings
        : allFindings.filter((f: any) =>
            selected_finding_ids.includes(f.id),
          )

    if (selectedFindings.length === 0 && customComments.length === 0) {
      return jsonResponse(
        { error: 'No findings or comments selected to post' },
        400,
      )
    }

    // ---------- 4. Build inline comments ----------
    const GITLAB_URL = Deno.env.get('GITLAB_URL')
    const GITLAB_TOKEN = Deno.env.get('GITLAB_TOKEN')

    if (!GITLAB_URL || !GITLAB_TOKEN) {
      return jsonResponse(
        { error: 'GITLAB_URL and GITLAB_TOKEN must be configured' },
        500,
      )
    }

    const sevEmoji: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '⚪',
    }

    const catEmoji: Record<string, string> = {
      security: '🔒',
      performance: '⚡',
      architecture: '🏗️',
      'code-quality': '✨',
      'test-coverage': '🧪',
      style: '🎨',
      context: '📚',
    }

    const comments: Array<{ body: string; position: Record<string, unknown> }> =
      []

    for (const f of selectedFindings) {
      const sev = sevEmoji[f.severity] || '⚪'
      const cat = catEmoji[f.category] || '📋'

      let body = `${sev} ${cat} **[#${f.id}] ${f.title}**\n\n`
      body += `**Severity:** ${f.severity}\n`
      body += `**Category:** ${f.category}\n\n`
      body += `${f.description}\n\n`
      body += `**Suggestion:** ${f.suggestion || 'N/A'}\n\n`
      body += `---\n_AI Code Review_`

      comments.push({
        body,
        position: {
          base_sha: review.base_sha,
          start_sha: review.start_sha,
          head_sha: review.head_sha,
          position_type: 'text',
          new_path: f.file_path,
          new_line: f.line,
        },
      })
    }

    for (const c of customComments) {
      comments.push({
        body: `💬 **CTO Comment**\n\n${c.message}\n\n---\n_Added by @${approver}_`,
        position: {
          base_sha: review.base_sha,
          start_sha: review.start_sha,
          head_sha: review.head_sha,
          position_type: 'text',
          new_path: c.file_path,
          new_line: c.line,
        },
      })
    }

    // ---------- 5. Post in batches of 5 with 1 s delay ----------
    const discussionsUrl = `${GITLAB_URL}/api/v4/projects/${review.project_id}/merge_requests/${review.mr_iid}/discussions`

    let postedCount = 0
    const errors: string[] = []

    for (let i = 0; i < comments.length; i += 5) {
      const batch = comments.slice(i, i + 5)

      const results = await Promise.allSettled(
        batch.map((c) =>
          fetch(discussionsUrl, {
            method: 'POST',
            headers: {
              'PRIVATE-TOKEN': GITLAB_TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ body: c.body, position: c.position }),
          }),
        ),
      )

      for (const r of results) {
        if (
          r.status === 'fulfilled' &&
          (r as PromiseFulfilledResult<Response>).value.ok
        ) {
          postedCount++
        } else if (r.status === 'rejected') {
          errors.push((r as PromiseRejectedResult).reason?.message ?? 'Unknown fetch error')
        } else if (r.status === 'fulfilled') {
          const resp = (r as PromiseFulfilledResult<Response>).value
          const text = await resp.text().catch(() => 'Could not read body')
          errors.push(`GitLab ${resp.status}: ${text}`)
        }
      }

      // Delay between batches (skip after last batch)
      if (i + 5 < comments.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // ---------- 6. Update review status ----------
    const { error: updateError } = await supabase
      .from('pending_reviews')
      .update({
        status: 'approved',
        approved_by: approver,
        approved_at: new Date().toISOString(),
      })
      .eq('review_id', review_id)

    if (updateError) {
      console.error('Failed to update review status:', updateError)
    }

    // ---------- 7. Record review history ----------
    const selectedIdSet = new Set(
      selected_finding_ids === 'all'
        ? allFindings.map((f: any) => f.id)
        : selected_finding_ids,
    )

    const historyRows = allFindings.map((f: any) => ({
      review_id,
      project_id: review.project_id,
      mr_iid: review.mr_iid,
      file_path: f.file_path,
      issue_type: f.category,
      issue_subcategory: f.subcategory || null,
      severity: f.severity,
      finding_data: f,
      was_accepted: selectedIdSet.has(f.id),
      reviewed_at: new Date().toISOString(),
    }))

    if (historyRows.length > 0) {
      const { error: historyError } = await supabase
        .from('review_history')
        .insert(historyRows)

      if (historyError) {
        console.error('Failed to insert review history:', historyError)
      }
    }

    return jsonResponse({
      success: true,
      posted_count: postedCount,
      total_findings: allFindings.length,
      total_comments: comments.length,
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (error) {
    console.error('approve-review error:', error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    )
  }
})
