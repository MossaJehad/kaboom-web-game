import { prisma, Prisma, type CurrencyTxType } from "@skyhop/database";
import { badRequest, conflict } from "../utils/errors.js";

export interface CreditCoinsInput {
  userId: string;
  amount: number;
  source: string;
  description: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  type?: CurrencyTxType;
}

export async function creditCoinsTx(
  tx: Prisma.TransactionClient,
  input: CreditCoinsInput
): Promise<{ applied: boolean; balance: number; transactionId: string }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw badRequest("Credit amount must be a positive integer");
  }

  const existing = await tx.currencyTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return { applied: false, balance: existing.balanceAfter, transactionId: existing.id };
  }

  const wallet = await tx.wallet.update({
    where: { userId: input.userId },
    data: {
      balance: { increment: input.amount },
      totalEarned: { increment: input.amount },
    },
  });

  const ledger = await tx.currencyTransaction.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      balanceAfter: wallet.balance,
      type: input.type ?? "CREDIT",
      source: input.source,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  return { applied: true, balance: wallet.balance, transactionId: ledger.id };
}

export interface DebitCoinsInput {
  userId: string;
  amount: number;
  source: string;
  description: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

/**
 * Atomically debits coins only if balance >= amount (prevents race conditions & negative balances).
 */
export async function debitCoinsTx(
  tx: Prisma.TransactionClient,
  input: DebitCoinsInput
): Promise<{ applied: boolean; balance: number; transactionId: string }> {
  if (!Number.isInteger(input.amount) || input.amount < 0) {
    throw badRequest("Debit amount must be a non-negative integer");
  }

  const existing = await tx.currencyTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return { applied: false, balance: existing.balanceAfter, transactionId: existing.id };
  }

  if (input.amount === 0) {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
    const ledger = await tx.currencyTransaction.create({
      data: {
        userId: input.userId,
        amount: 0,
        balanceAfter: wallet.balance,
        type: "DEBIT",
        source: input.source,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return { applied: true, balance: wallet.balance, transactionId: ledger.id };
  }

  // Conditional atomic update prevents negative balance even under concurrent requests
  const updated = await tx.wallet.updateMany({
    where: {
      userId: input.userId,
      balance: { gte: input.amount },
    },
    data: {
      balance: { decrement: input.amount },
      totalSpent: { increment: input.amount },
    },
  });

  if (updated.count === 0) {
    throw badRequest("Insufficient coins for this transaction.", "INSUFFICIENT_COINS");
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });

  const ledger = await tx.currencyTransaction.create({
    data: {
      userId: input.userId,
      amount: -input.amount,
      balanceAfter: wallet.balance,
      type: "DEBIT",
      source: input.source,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  return { applied: true, balance: wallet.balance, transactionId: ledger.id };
}

export async function adminAdjustCoins(params: {
  targetUserId: string;
  actorId: string;
  amount: number;
  reason: string;
  ipAddress?: string;
}): Promise<{ balance: number; transactionId: string }> {
  return prisma.$transaction(async (tx) => {
    const idempotencyKey = `admin_adj:${params.targetUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    if (params.amount > 0) {
      const res = await creditCoinsTx(tx, {
        userId: params.targetUserId,
        amount: params.amount,
        source: "ADMIN_ADJUSTMENT",
        description: `Admin adjustment: ${params.reason}`,
        idempotencyKey,
        type: "ADJUSTMENT",
        metadata: { actorId: params.actorId, reason: params.reason },
      });
      await tx.moderationAction.create({
        data: {
          targetUserId: params.targetUserId,
          moderatorId: params.actorId,
          actionType: "CURRENCY_ADJUST",
          reason: params.reason,
          metadata: { amount: params.amount, balanceAfter: res.balance },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: params.actorId,
          action: "ADMIN_CURRENCY_ADJUST",
          entityType: "Wallet",
          entityId: params.targetUserId,
          details: { amount: params.amount, reason: params.reason, balanceAfter: res.balance },
          ipAddress: params.ipAddress,
        },
      });
      return { balance: res.balance, transactionId: res.transactionId };
    }

    // Negative adjustment: clamp safely or reject if would go negative
    const absAmount = Math.abs(params.amount);
    const updated = await tx.wallet.updateMany({
      where: {
        userId: params.targetUserId,
        balance: { gte: absAmount },
      },
      data: {
        balance: { decrement: absAmount },
      },
    });
    if (updated.count === 0) {
      throw conflict("Cannot deduct more coins than the player's current balance.", "NEGATIVE_BALANCE_PREVENTED");
    }

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: params.targetUserId } });
    const ledger = await tx.currencyTransaction.create({
      data: {
        userId: params.targetUserId,
        amount: -absAmount,
        balanceAfter: wallet.balance,
        type: "ADJUSTMENT",
        source: "ADMIN_ADJUSTMENT",
        description: `Admin adjustment: ${params.reason}`,
        idempotencyKey,
        metadata: { actorId: params.actorId, reason: params.reason },
      },
    });

    await tx.moderationAction.create({
      data: {
        targetUserId: params.targetUserId,
        moderatorId: params.actorId,
        actionType: "CURRENCY_ADJUST",
        reason: params.reason,
        metadata: { amount: -absAmount, balanceAfter: wallet.balance },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: params.actorId,
        action: "ADMIN_CURRENCY_ADJUST",
        entityType: "Wallet",
        entityId: params.targetUserId,
        details: { amount: -absAmount, reason: params.reason, balanceAfter: wallet.balance },
        ipAddress: params.ipAddress,
      },
    });

    return { balance: wallet.balance, transactionId: ledger.id };
  });
}
