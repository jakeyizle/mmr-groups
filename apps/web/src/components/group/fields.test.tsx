import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, type UseFormReturn } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { SelectField, SwitchField, TextField } from "./fields";

interface Values {
  name: string;
  count: number;
  mode: string;
  on: boolean;
}

let form: UseFormReturn<Values>;
const keep = (f: UseFormReturn<Values>) => {
  form = f;
};

function Harness({
  description,
  onForm = keep,
}: {
  description?: string;
  onForm?: (f: UseFormReturn<Values>) => void;
}) {
  const f = useForm<Values>({
    defaultValues: { name: "Ann", count: 2, mode: "a", on: false },
  });
  onForm(f);
  return (
    <>
      <TextField
        control={f.control}
        name="name"
        label="Name"
        description={description}
      />
      <TextField control={f.control} name="count" label="Count" type="number" />
      <SelectField
        control={f.control}
        name="mode"
        label="Mode"
        options={{ a: "Mode A", b: "Mode B" }}
        description={description}
      />
      <SwitchField
        control={f.control}
        name="on"
        label="On"
        description={description}
      />
    </>
  );
}

describe("form fields", { tags: ["GROUP-001", "GROUP-005"] }, () => {
  it("keeps text as text and numbers as numbers", () => {
    render(<Harness />);
    const name = screen.getByRole("textbox", { name: "Name" });
    const count = screen.getByRole("spinbutton", { name: "Count" });
    expect(name.getAttribute("inputmode")).toBeNull();
    expect(count.getAttribute("inputmode")).toBe("numeric");

    fireEvent.change(name, { target: { value: "Bo" } });
    fireEvent.change(count, { target: { value: "5" } });
    expect(form.getValues()).toMatchObject({ name: "Bo", count: 5 });

    expect(name).toHaveProperty("value", "Bo");
    expect(count).toHaveProperty("value", "5");
    // React warns when given NaN as a value.
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fireEvent.change(count, { target: { value: "" } });
    expect(form.getValues("count")).toBeNaN();
    expect(count).toHaveProperty("value", "");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("shows descriptions only when given", () => {
    const { unmount } = render(<Harness />);
    expect(screen.queryByText("Help")).toBeNull();
    unmount();
    render(<Harness description="Help" />);
    expect(
      screen.getAllByText("Help").map((el) => el.getAttribute("data-slot")),
    ).toEqual(["field-description", "field-description", "field-description"]);
  });

  it("shows field errors", async () => {
    render(<Harness />);
    act(() => {
      form.setError("name", { message: "Name is bad" });
      form.setError("mode", { message: "Mode is bad" });
    });
    expect(screen.getByText("Name is bad")).toBeTruthy();
    expect(screen.getByText("Mode is bad")).toBeTruthy();

    await userEvent.click(screen.getByRole("switch", { name: "On" }));
    expect(form.getValues("on")).toBe(true);
  });
});
