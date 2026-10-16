import { log } from "./lib/log.js";
import { sendActivitySummary } from "./lib/activitySummary.js";

sendActivitySummary(1, "notifyDailySummary", "notifyDiscordDailySummary", "DAILY_SUMMARY").catch((err) => {
  log.error(err);
  process.exit(1);
});
