import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost", "danger"] },
    size:    { control: "inline-radio", options: ["sm", "md", "lg"] },
    loading: { control: "boolean" },
    disabled:{ control: "boolean" },
    onClick: { action: "clicked" },
  },
  args: {
    variant: "primary",
    size: "md",
    children: "Confirmar cita",
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary:   Story = { args: { variant: "primary",   children: "Confirmar cita" } };
export const Secondary: Story = { args: { variant: "secondary", children: "Cancelar" } };
export const Ghost:     Story = { args: { variant: "ghost",     children: "Más opciones" } };
export const Danger:    Story = { args: { variant: "danger",    children: "Eliminar paciente" } };

export const Loading:   Story = { args: { loading: true, children: "Procesando…" } };
export const Disabled:  Story = { args: { disabled: true, children: "No disponible" } };

export const SizeMatrix: Story = {
  render: () => (
    <div className="flex flex-col gap-4 items-start">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex gap-2 items-center">
          <span className="w-8 text-xs text-velum-500">{size}</span>
          <Button size={size}>Primary</Button>
          <Button size={size} variant="secondary">Secondary</Button>
          <Button size={size} variant="ghost">Ghost</Button>
          <Button size={size} variant="danger">Danger</Button>
        </div>
      ))}
    </div>
  ),
};
