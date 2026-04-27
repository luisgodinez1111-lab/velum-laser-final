import type { Preview } from "@storybook/react-vite";
import "../index.css";
import "../design/tokens.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "padded",
    backgrounds: {
      default: "canvas",
      values: [
        { name: "canvas", value: "var(--color-surface-canvas)" },
        { name: "raised", value: "var(--color-surface-raised)" },
        { name: "accent", value: "var(--color-surface-accent)" },
      ],
    },
  },
};

export default preview;
