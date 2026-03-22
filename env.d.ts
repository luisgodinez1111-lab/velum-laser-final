/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the API, e.g. /api or https://api.velumlaser.com */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
