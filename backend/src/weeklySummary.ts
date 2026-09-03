import { sendActivitySummary } from "./lib/activitySummary.js";

sendActivitySummary(7, "notifyWeeklySummary", "notifyDiscordWeeklySummary", "WEEKLY_SUMMARY").catch((err) => {
  console.error(err);
  process.exit(1);
});
