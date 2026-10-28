import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/** A player's name, linking to their profile (STATS-013); removed players have none. */
export function PlayerLink({
  gid,
  id,
  names,
  className,
}: {
  gid: string;
  id: string;
  names: Map<string, string>;
  className?: string;
}) {
  const name = names.get(id);
  if (name === undefined)
    return <span className={className}>Removed player</span>;
  return (
    <Link
      to="/g/$gid/players/$pid"
      params={{ gid, pid: id }}
      className={cn("hover:underline", className)}
    >
      {name}
    </Link>
  );
}
