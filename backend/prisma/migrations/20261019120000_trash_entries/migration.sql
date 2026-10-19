-- Trash for deleted rooms, prefabs, themes and pictures (P35). Additive only: one new table, no existing table changes.

-- CreateTable
CREATE TABLE "trash_entries" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "doc" TEXT,
    "png" BYTEA,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trash_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trash_entries_deletedAt_idx" ON "trash_entries"("deletedAt");
