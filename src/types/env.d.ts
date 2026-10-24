interface BotEnvironment {
  TELEGRAM_BOT_TOKEN?: string;
  BOT_API_TOKEN?: string;
  OPENCAPPER_API_URL?: string;
  WEBSITE_URL?: string;
  LOG_LEVEL?: string;
  DATA_DIR?: string;
}

declare namespace NodeJS {
  export interface ProcessEnv extends BotEnvironment {}
}
