'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { GitMerge, LogOut } from 'lucide-react'

export function Header() {
  const [email, setEmail] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null)
    })
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-20 h-14 border-b bg-background/80 backdrop-blur flex items-center justify-between px-4 sm:px-6">
      <Link href="/reviews" className="flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <GitMerge className="size-4" strokeWidth={2.25} />
        </span>
        <span className="text-sm font-semibold tracking-tight">PR Agent</span>
        <span className="hidden sm:inline text-sm text-muted-foreground">CTO review</span>
      </Link>
      {email && (
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden sm:inline text-sm text-muted-foreground">{email}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut} aria-label="Sign out">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      )}
    </header>
  )
}
