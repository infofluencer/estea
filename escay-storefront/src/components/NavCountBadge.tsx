export function NavCountBadge({ count }: { count: number }) {
  if (count <= 0) return null

  return (
    <span className="site-header__badge" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  )
}
