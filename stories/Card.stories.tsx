import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, CardHeader, CardTitle, CardDescription } from "./Card";
import { Button } from "./Button";

const meta: Meta<typeof Card> = {
  title: "Primitives/Card",
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <div>
          <CardTitle>Próxima cita</CardTitle>
          <CardDescription>Lunes 12 de mayo · 10:00 AM</CardDescription>
        </div>
        <Button size="sm" variant="ghost">Ver detalles</Button>
      </CardHeader>
      <p className="text-sm leading-relaxed">
        Tratamiento de láser CO2 fraccionado. Llegar 10 minutos antes para
        completar el cuestionario pre-procedimiento.
      </p>
    </Card>
  ),
};

export const Subtle: Story = {
  args: { tone: "subtle" },
  render: Default.render,
};

export const Accent: Story = {
  render: () => (
    <Card tone="accent" padding="lg">
      <CardHeader>
        <CardTitle className="text-white">Membresía VIP activa</CardTitle>
      </CardHeader>
      <p className="text-sm opacity-90">
        Tu próxima sesión incluida está disponible. Agéndala desde la app o
        llama a recepción.
      </p>
    </Card>
  ),
};

export const Raised: Story = {
  args: { raised: true },
  render: Default.render,
};

export const PaddingMatrix: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["sm", "md", "lg"] as const).map((p) => (
        <Card key={p} padding={p}>
          <span className="text-sm">padding={p}</span>
        </Card>
      ))}
    </div>
  ),
};
