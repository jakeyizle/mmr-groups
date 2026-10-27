import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { DangerZone } from "@/components/group/danger-zone";
import { GeneralSettings } from "@/components/group/general-settings";
import { InviteSettings } from "@/components/group/invite-settings";
import { LeaveGroup } from "@/components/group/leave-group";
import { PlayersSettings } from "@/components/group/players-settings";
import { requireUser } from "@/lib/auth";
import { Can } from "@/lib/can";
import { groupQuery, useGroupActor } from "@/lib/groups";

export const Route = createFileRoute("/g/$gid/settings")({
  beforeLoad: requireUser,
  component: Settings,
});

function Settings() {
  const { gid } = Route.useParams();
  const { data } = useQuery(groupQuery(gid));
  const actor = useGroupActor(data);
  if (!data) return null;
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">General</h2>
        <GeneralSettings data={data} />
      </section>
      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">
          Players &amp; roles
        </h2>
        <PlayersSettings data={data} />
      </section>
      <Can actor={actor} action="invite.manage">
        <section className="space-y-4">
          <h2 className="font-heading text-lg font-semibold">Invite link</h2>
          <InviteSettings data={data} />
        </section>
      </Can>
      <LeaveGroup data={data} />
      <DangerZone data={data} />
    </div>
  );
}
