import { sendActivitySummary } from "./lib/activitySummary.js";

sendActivitySummary(1, "notifyDailySummary", "DAILY_SUMMARY").catch((err) => {
  console.error(err);
  process.exit(1);
});
