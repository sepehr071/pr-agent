'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface ExecutiveSummaryProps {
  summary: string
}

export function ExecutiveSummary({ summary }: ExecutiveSummaryProps) {
  const [open, setOpen] = useState(true)
  // Summaries can be written in Persian; right-align them with the reading direction.
  const rtl = /[\u0590-\u08FF]/.test(summary.slice(0, 40))

  return (
    <Collapsible open={open} onOpenChange={setOpen} defaultOpen>
      <CollapsibleTrigger className="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        Executive summary
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p
          dir={rtl ? 'rtl' : 'ltr'}
          className={cn(
            'mt-1.5 max-w-[80ch] border-s-2 border-primary/50 ps-3 text-start text-sm text-foreground/85 whitespace-pre-wrap',
            rtl ? 'ml-auto leading-loose' : 'leading-relaxed'
          )}
        >
          {summary}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
