-- Calendar access (fix413): who may change events, the members, the picture cap and the creator.
ALTER TABLE "calendars"
  ADD COLUMN "editMode" TEXT NOT NULL DEFAULT 'guests',
  ADD COLUMN "members" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "pictureCap" INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT '';
