import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { client, meQuery, unwrap } from "@/lib/api";
import type { GroupData } from "@/lib/groups";

/**
 * VIS-013: site admins hide a group from the public index; its admins see a notice.
 * `hiddenFromIndex` is only in the admin snapshot, so others render nothing.
 */
export function IndexVisibility({ data }: { data: GroupData }) {
  const { group, hiddenFromIndex } = data;
  const { data: me } = useQuery(meQuery);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (hidden: boolean) =>
      unwrap(
        await client.groups[":gid"].$patch({
          param: { gid: group.id },
          json: { hiddenFromIndex: hidden },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group", group.id] });
      await queryClient.invalidateQueries({ queryKey: ["public-groups"] });
    },
  });

  if (hiddenFromIndex === undefined) return null;
  if (!me?.isSiteAdmin) {
    return hiddenFromIndex ? (
      <p role="note" className="text-sm text-muted-foreground">
        A site admin has hidden this group from the public index. It can still
        be viewed by anyone with its link
        {group.visibility === "private" && " once it's public"}.
      </p>
    ) : null;
  }
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor="hiddenFromIndex">
          Hide from public index
        </FieldLabel>
        <FieldDescription>
          Site admins only. The group stays viewable by its link.
        </FieldDescription>
        <FieldError
          errors={save.error ? [{ message: save.error.message }] : []}
        />
      </FieldContent>
      <Switch
        id="hiddenFromIndex"
        checked={hiddenFromIndex}
        disabled={save.isPending}
        onCheckedChange={(checked) => {
          save.mutate(checked);
        }}
      />
    </Field>
  );
}
