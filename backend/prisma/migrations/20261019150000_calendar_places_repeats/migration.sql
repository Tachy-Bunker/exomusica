-- Calendar places and repeats (fix414): coordinates for the map, a repeat with an end, and the days skipped in a repeat.
ALTER TABLE "calendar_events"
  ADD COLUMN "lat" DOUBLE PRECISION,
  ADD COLUMN "lng" DOUBLE PRECISION,
  ADD COLUMN "recurrence" TEXT,
  ADD COLUMN "recurUntil" TEXT,
  ADD COLUMN "exdates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
