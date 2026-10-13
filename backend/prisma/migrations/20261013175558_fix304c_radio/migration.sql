-- CreateTable
CREATE TABLE "RadioBlock" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "hours" INTEGER NOT NULL,

    CONSTRAINT "RadioBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RadioBlock_startHour_idx" ON "RadioBlock"("startHour");

-- AddForeignKey
ALTER TABLE "RadioBlock" ADD CONSTRAINT "RadioBlock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
