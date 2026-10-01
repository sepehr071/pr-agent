'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface ActionBarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onApproveSelected: () => void
  onApproveAll: () => void
  onRejectAll: () => void
  isApproving: boolean
  isRejecting: boolean
  reviewStatus: string
}

export function ActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onApproveSelected,
  onApproveAll,
  onRejectAll,
  isApproving,
  isRejecting,
  reviewStatus,
}: ActionBarProps) {
  const isPending = reviewStatus === 'pending_approval'

  return (
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card/90 backdrop-blur px-4 py-3 sm:px-6">
      {/* Left side */}
      <div className="flex items-center gap-3">
        {isPending && (
          <Button
            size="sm"
            variant="outline"
            onClick={selectedCount < totalCount ? onSelectAll : onDeselectAll}
          >
            {selectedCount < totalCount ? 'Select All' : 'Deselect All'}
          </Button>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{selectedCount}</span> of {totalCount} selected
        </span>
      </div>

      {/* Right side */}
      <div className="flex flex-wrap items-center gap-2">
        {!isPending ? (
          <Badge variant="secondary" className="text-sm">
            Already {reviewStatus.replace(/_/g, ' ')}
          </Badge>
        ) : (
          <>
            <Button
              onClick={onApproveSelected}
              disabled={selectedCount === 0 || isApproving}
            >
              {isApproving ? 'Approving...' : 'Approve Selected'}
            </Button>

            <Button
              variant="secondary"
              onClick={onApproveAll}
              disabled={isApproving}
            >
              {isApproving ? 'Approving...' : 'Approve All'}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isRejecting}>
                  {isRejecting ? 'Rejecting...' : 'Reject All'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject All Findings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reject all findings and post a rejection note to
                    GitLab. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onRejectAll}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  )
}
