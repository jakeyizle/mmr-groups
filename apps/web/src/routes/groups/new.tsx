import { zodResolver } from "@hookform/resolvers/zod";
import { createGroupSchema, nameSchema } from "@mmr/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { SelectField, SwitchField, TextField } from "@/components/group/fields";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { client, unwrap } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { ROLE_OPTIONS, SCORING_LABELS, VISIBILITY_OPTIONS } from "@/lib/groups";

export const Route = createFileRoute("/groups/new")({
  beforeLoad: requireUser,
  component: NewGroup,
});

// Flat form model; mapped onto the API's `teamFormat` union on submit.
const formSchema = createGroupSchema.omit({ teamFormat: true }).extend({
  name: nameSchema,
  playerName: nameSchema,
  formatKind: z.enum(["fixed", "flexible"]),
  teams: z.int().min(2).max(8),
  size: z.int().min(1).max(8),
});
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

function NewGroup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      playerName: "",
      formatKind: "fixed",
      teams: 2,
      size: 2,
      scoringMode: "optional",
      allowTies: false,
      defaultRole: "recorder",
      visibility: "private",
    },
  });
  const formatKind = useWatch({ control: form.control, name: "formatKind" });

  const create = useMutation({
    mutationFn: async ({ formatKind, teams, size, ...rest }: FormOutput) =>
      unwrap(
        await client.groups.$post({
          json: {
            ...rest,
            teamFormat:
              formatKind === "fixed"
                ? { kind: "fixed", teams, size }
                : { kind: "flexible" },
          },
        }),
      ),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await navigate({ to: "/g/$gid", params: { gid: id } });
    },
    onError: (err) => {
      form.setError("root", { message: err.message });
    },
  });

  return (
    <section className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">New group</h1>
      <form
        onSubmit={(e) =>
          void form.handleSubmit((values) => {
            create.mutate(values);
          })(e)
        }
        noValidate
      >
        <FieldGroup>
          <TextField control={form.control} name="name" label="Group name" />
          <TextField
            control={form.control}
            name="playerName"
            label="Your player name"
            description="How you'll appear on the leaderboard."
          />

          <FieldSet>
            <FieldLegend variant="label">Team format</FieldLegend>
            <Controller
              control={form.control}
              name="formatKind"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange}>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="fixed" id="format-fixed" />
                    <FieldLabel htmlFor="format-fixed" className="font-normal">
                      Fixed teams (e.g. 2 teams of 2 for doubles)
                    </FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="flexible" id="format-flexible" />
                    <FieldLabel
                      htmlFor="format-flexible"
                      className="font-normal"
                    >
                      Flexible (any number of teams, any sizes)
                    </FieldLabel>
                  </Field>
                </RadioGroup>
              )}
            />
            {formatKind === "fixed" && (
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  control={form.control}
                  name="teams"
                  label="Teams"
                  type="number"
                />
                <TextField
                  control={form.control}
                  name="size"
                  label="Players per team"
                  type="number"
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              The format can&apos;t be changed later.
            </p>
          </FieldSet>

          <SelectField
            control={form.control}
            name="scoringMode"
            label="Scoring"
            options={SCORING_LABELS}
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
          <Button type="submit" disabled={create.isPending}>
            Create group
          </Button>
        </FieldGroup>
      </form>
    </section>
  );
}
