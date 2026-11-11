interface BotEnvironment {
  TELEGRAM_BOT_TOKEN?: string;
  OPENEV_API_URL?: string;
  OPENEV_WEBSITE_URL?: string;
  INTERNAL_TOKEN?: string;
  DRY_RUN?: string;
  LOG_LEVEL?: string;
  DATA_DIR?: string;
}

declare namespace NodeJS {
  export interface ProcessEnv extends BotEnvironment {}
}
