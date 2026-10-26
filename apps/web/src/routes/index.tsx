import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { meQuery } from "@/lib/api";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { data: me } = useQuery(meQuery);
  return (
    <section className="space-y-2">
      <h1 className="font-heading text-2xl font-semibold">
        {me ? "Your groups" : "Track your group's ratings"}
      </h1>
      <p className="text-muted-foreground">
        {me
          ? "Your groups will appear here."
          : "Record matches with your regular crew and see who's on top."}
      </p>
    </section>
  );
}
