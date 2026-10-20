-- Calendar change tape (fix416): one line per change to a calendar (added, moved, changed, cancelled, skipped, put back).
-- Kept to the latest 300 per calendar by the app; removed with the calendar.
CREATE TABLE "calendar_changes" (
    "id" SERIAL NOT NULL,
    "calendarId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "who" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_changes_calendarId_at_idx" ON "calendar_changes"("calendarId", "at");

-- AddForeignKey
ALTER TABLE "calendar_changes" ADD CONSTRAINT "calendar_changes_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
