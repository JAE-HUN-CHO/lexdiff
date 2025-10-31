"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Scale, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"

interface HeaderProps {
  onReset?: () => void
  onFavoritesClick?: () => void
}

export function Header({ onReset, onFavoritesClick }: HeaderProps) {
  const [favoritesCount, setFavoritesCount] = useState(0)

  useEffect(() => {
    const unsubscribe = favoritesStore.subscribe((favs) => {
      setFavoritesCount(favs.length)
    })

    setFavoritesCount(favoritesStore.getFavorites().length)

    return unsubscribe
  }, [])

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onReset) {
      onReset()
    }
    window.history.pushState({}, "", "/")
  }

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <button
          onClick={handleHomeClick}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Scale className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col items-start">
            <h1 className="text-lg font-bold text-foreground" style={{ fontFamily: "GiantsInline, sans-serif" }}>
              LexDiff
            </h1>
            <p className="text-xs text-muted-foreground">See the Difference in Law.</p>
          </div>
        </button>

        {favoritesCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onFavoritesClick} className="flex items-center gap-2">
            <Star className="h-5 w-5 text-[var(--color-warning)] fill-[var(--color-warning)]" />
            <Badge variant="secondary" className="text-xs">
              {favoritesCount}
            </Badge>
          </Button>
        )}
      </div>
    </header>
  )
}
