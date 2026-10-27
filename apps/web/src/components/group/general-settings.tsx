import { zodResolver } from "@hookform/resolvers/zod";
import { can, updateGroupSchema } from "@mmr/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { SelectField, SwitchField, TextField } from "@/components/group/fields";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { client, unwrap } from "@/lib/api";
import {
  formatLabel,
  type GroupData,
  ROLE_OPTIONS,
  SCORING_LABELS,
  useGroupActor,
  VISIBILITY_OPTIONS,
} from "@/lib/groups";

const formSchema = updateGroupSchema.omit({ hiddenFromIndex: true }).required();
type FormInput = z.input<typeof formSchema>;

export function GeneralSettings({ data }: { data: GroupData }) {
  const { group } = data;
  const actor = useGroupActor(data);
  const editable = can(actor, "group.editSettings");
  const queryClient = useQueryClient();

  const form = useForm<FormInput, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: {
      name: group.name,
      description: group.description,
      scoringMode: group.scoringMode,
      allowTies: group.allowTies,
      defaultRole: group.defaultRole,
      visibility: group.visibility,
    },
    disabled: !editable,
  });

  const save = useMutation({
    mutationFn: async (json: Partial<z.output<typeof formSchema>>) =>
      unwrap(
        await client.groups[":gid"].$patch({ param: { gid: group.id }, json }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group", group.id] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err) => {
      form.setError("root", { message: err.message });
    },
  });

  return (
    <form
      onSubmit={(e) =>
        void form.handleSubmit((values) => {
          // Only what changed: a true partial PATCH (PLAN §8).
          const { dirtyFields } = form.formState;
          save.mutate(
            Object.fromEntries(
              Object.entries(values).filter(
                ([k]) => dirtyFields[k as keyof typeof values],
              ),
            ),
          );
        })(e)
      }
      noValidate
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Group name" />
        <TextField
          control={form.control}
          name="description"
          label="Description"
          multiline
        />
        <Field>
          <FieldLabel>Team format</FieldLabel>
          <p>{formatLabel(group.teamFormat)}</p>
          <FieldDescription>Set when the group was created.</FieldDescription>
        </Field>
        <SelectField
          control={form.control}
          name="scoringMode"
          label="Scoring"
          options={SCORING_LABELS}
          description="Applies to new and edited matches; existing matches stay as recorded."
        />
        <SwitchField
          control={form.control}
          name="allowTies"
          label="Allow ties"
        />
        <SelectField
          control={form.control}
          name="defaultRole"
          label="Default role for new players"
          options={ROLE_OPTIONS}
        />
        <SelectField
          control={form.control}
          name="visibility"
          label="Visibility"
          options={VISIBILITY_OPTIONS}
        />
        <FieldError errors={[form.formState.errors.root]} />
        {editable && (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={save.isPending || !form.formState.isDirty}
            >
              Save settings
            </Button>
            {save.isSuccess && !form.formState.isDirty && (
              <span role="status" className="text-sm text-muted-foreground">
                Saved
              </span>
            )}
          </div>
        )}
      </FieldGroup>
    </form>
  );
}
