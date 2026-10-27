import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { client, unwrap } from "@/lib/api";
import type { GroupData } from "@/lib/groups";

/** JOIN-010/011: members leave; the owner has to transfer ownership first. */
export function LeaveGroup({ data }: { data: GroupData }) {
  const { group, me } = data;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const leave = useMutation({
    mutationFn: async () =>
      unwrap(
        await client.groups[":gid"].leave.$post({ param: { gid: group.id } }),
      ),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["group", group.id] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await navigate({ to: "/" });
    },
  });
  if (!me) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold">Leave group</h2>
      {me.role === "owner" ? (
        <p className="text-sm text-muted-foreground">
          You own this group. Transfer ownership before leaving.
        </p>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">Leave group</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {group.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Your player and their matches stay in the group, unclaimed.
                You&apos;ll need an invite link to come back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  leave.mutate();
                }}
              >
                Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
