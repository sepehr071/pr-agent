export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type Category =
  | 'security'
  | 'performance'
  | 'style'
  | 'architecture'
  | 'test-coverage'
  | 'code-quality'
  | 'context'

export interface Finding {
  id: number
  file_path: string
  line: number
  severity: Severity
  category: Category
  subcategory: string
  title: string
  description: string
  suggestion: string
  confidence: 'high' | 'medium' | 'low'
  cwe_id?: string
  impact?: string
  auto_fixable?: boolean
  test_example?: string
  metrics?: string
  related_files?: string[]
}

export interface ReviewStats {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  by_category: Record<string, number>
}

export interface ReviewMetadata {
  risk_score: number
  executive_summary: string
  model: string
  languages: string[]
}

export interface CustomComment {
  file_path: string
  line: number
  message: string
  added_by: string
  added_at: string
}

export interface ReviewListItem {
  review_id: string
  mr_iid: number
  project_id: number
  status: string
  created_at: string
  confidence_score: number
  risk_score: number
  executive_summary: string
  total_findings: number
  critical_findings: number
  high_findings: number
  approved_by: string | null
}

export interface PendingReview {
  review_id: string
  mr_iid: number
  project_id: number
  findings: Finding[]
  stats: ReviewStats
  draft_note_id: number
  confidence_score: number
  review_metadata: ReviewMetadata
  base_sha: string
  head_sha: string
  start_sha: string
  custom_comments: CustomComment[]
  status: string
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  created_at: string
}

export interface ApproveResponse {
  success: boolean
  posted_count?: number
  total_findings?: number
  error?: string
}

export interface RejectResponse {
  success: boolean
  error?: string
}
