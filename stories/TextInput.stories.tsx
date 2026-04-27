import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextInput } from "./TextInput";

const meta: Meta<typeof TextInput> = {
  title: "Primitives/TextInput",
  component: TextInput,
  args: {
    label: "Correo electrónico",
    placeholder: "paciente@ejemplo.com",
    type: "email",
  },
};

export default meta;
type Story = StoryObj<typeof TextInput>;

export const Default: Story = {};

export const WithHelper: Story = {
  args: { helper: "Usaremos este correo para enviar recordatorios y comprobantes." },
};

export const WithError: Story = {
  args: { error: "Formato inválido. Ejemplo: usuario@dominio.com", value: "no-es-email" },
};

export const Required: Story = { args: { required: true } };

export const WithTrailing: Story = {
  args: {
    label: "Monto a cobrar",
    type: "number",
    placeholder: "0.00",
    trailing: "MXN",
  },
};

export const Disabled: Story = { args: { disabled: true, value: "paciente@velum.mx" } };
