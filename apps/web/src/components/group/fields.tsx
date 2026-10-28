import type { ReactNode } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
} from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface FieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: ReactNode;
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  multiline,
  type,
}: FieldProps<T> & { multiline?: boolean; type?: "text" | "number" }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          {multiline ? (
            <Textarea id={name} {...field} aria-invalid={fieldState.invalid} />
          ) : (
            <Input
              id={name}
              type={type}
              inputMode={type === "number" ? "numeric" : undefined}
              {...field}
              onChange={(e) => {
                field.onChange(
                  type === "number" ? e.target.valueAsNumber : e.target.value,
                );
              }}
              value={
                // Stryker disable next-line ConditionalExpression: only number fields hold NaN
                type === "number" && Number.isNaN(field.value)
                  ? // Stryker disable next-line StringLiteral: a number input shows any non-number as empty
                    ""
                  : field.value
              }
              aria-invalid={fieldState.invalid}
            />
          )}
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  options,
}: FieldProps<T> & { options: Record<string, string> }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Select
            name={field.name}
            value={field.value}
            onValueChange={field.onChange}
          >
            <SelectTrigger id={name} aria-invalid={fieldState.invalid}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(options).map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
}: FieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
          </FieldContent>
          <Switch
            id={name}
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        </Field>
      )}
    />
  );
}
