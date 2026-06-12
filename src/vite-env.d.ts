/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TG_BOT_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
