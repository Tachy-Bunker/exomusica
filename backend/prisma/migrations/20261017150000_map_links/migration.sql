-- Map links (fix406): corridors between rooms on the Scan map and the destinations of a lift cabin. Additive only: no existing table changes.

-- CreateTable
CREATE TABLE "map_links" (
    "id" SERIAL NOT NULL,
    "fromSlug" TEXT NOT NULL,
    "toSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'corridor',
    "gate" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_links_fromSlug_toSlug_kind_key" ON "map_links"("fromSlug", "toSlug", "kind");
