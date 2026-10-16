-- Find in room: the room's Hidden switch is saved to the account. A hidden member is not found on their profile,
-- nobody in a room sees them, and they are left out of the presence totals.
ALTER TABLE "User" ADD COLUMN "roomHidden" BOOLEAN NOT NULL DEFAULT false;
