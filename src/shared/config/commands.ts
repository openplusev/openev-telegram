export const COMMANDS = [
  { command: "pick", description: "Lock a pick at the current market odds" },
  { command: "recap", description: "Record of every capper in this chat" },
  { command: "record", description: "A capper's verified record" },
  { command: "leaderboard", description: "Top cappers by ROI" },
  { command: "verify", description: "Link to the public proof of a pick" },
  { command: "help", description: "How this bot works" },
] as const;
