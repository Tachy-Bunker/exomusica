-- Room editor version history (E5): the last saves of each room document, kept for restoring. Additive only: no existing table changes.

-- CreateTable
CREATE TABLE "room_doc_versions" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "doc" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_doc_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_doc_versions_slug_id_idx" ON "room_doc_versions"("slug", "id");
