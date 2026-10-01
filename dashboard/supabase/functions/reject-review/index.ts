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
    const { review_id, rejector } = await req.json()

    if (!review_id) {
      return jsonResponse({ error: 'review_id is required' }, 400)
    }
    if (!rejector) {
      return jsonResponse({ error: 'rejector is required' }, 400)
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

    // ---------- 2. Post rejection note to GitLab ----------
    const GITLAB_URL = Deno.env.get('GITLAB_URL')
    const GITLAB_TOKEN = Deno.env.get('GITLAB_TOKEN')

    if (!GITLAB_URL || !GITLAB_TOKEN) {
      return jsonResponse(
        { error: 'GITLAB_URL and GITLAB_TOKEN must be configured' },
        500,
      )
    }

    const rejectionBody =
      `## ❌ AI Code Review Rejected\n\n` +
      `Review has been rejected by @${rejector}.\n\n` +
      `No inline comments will be posted.\n\n` +
      `---\n_Review ID: \`${review_id}\`_`

    const notesUrl = `${GITLAB_URL}/api/v4/projects/${review.project_id}/merge_requests/${review.mr_iid}/notes`

    const gitlabResponse = await fetch(notesUrl, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': GITLAB_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: rejectionBody }),
    })

    if (!gitlabResponse.ok) {
      const errorText = await gitlabResponse.text().catch(() => 'Could not read body')
      console.error(`GitLab note failed (${gitlabResponse.status}): ${errorText}`)
      // Continue with status update even if GitLab post fails
    }

    // ---------- 3. Update review status ----------
    const { error: updateError } = await supabase
      .from('pending_reviews')
      .update({
        status: 'rejected',
        rejected_by: rejector,
        rejected_at: new Date().toISOString(),
      })
      .eq('review_id', review_id)

    if (updateError) {
      console.error('Failed to update review status:', updateError)
    }

    // ---------- 4. Record review history (all rejected) ----------
    const allFindings: any[] =
      typeof review.findings === 'string'
        ? JSON.parse(review.findings)
        : review.findings

    if (allFindings && allFindings.length > 0) {
      const historyRows = allFindings.map((f: any) => ({
        review_id,
        project_id: review.project_id,
        mr_iid: review.mr_iid,
        file_path: f.file_path,
        issue_type: f.category,
        issue_subcategory: f.subcategory || null,
        severity: f.severity,
        finding_data: f,
        was_accepted: false,
        reviewed_at: new Date().toISOString(),
      }))

      const { error: historyError } = await supabase
        .from('review_history')
        .insert(historyRows)

      if (historyError) {
        console.error('Failed to insert review history:', historyError)
      }
    }

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('reject-review error:', error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    )
  }
})
