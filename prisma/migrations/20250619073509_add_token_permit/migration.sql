-- CreateTable
CREATE TABLE "TokenPermit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "owner" TEXT NOT NULL,
    "spender" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "deadline" INTEGER NOT NULL,
    "v" INTEGER NOT NULL,
    "r" TEXT NOT NULL,
    "s" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "txHash" TEXT,
    "userId" TEXT,

    CONSTRAINT "TokenPermit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TokenPermit" ADD CONSTRAINT "TokenPermit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
