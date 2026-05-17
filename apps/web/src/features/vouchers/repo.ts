import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import {
  vouchers,
  voucherRedemptions,
  bookings,
  venues,
  type Voucher,
  type NewVoucher,
} from "@/db/schema";

type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

export async function findVoucherByCode(code: string): Promise<Voucher | undefined> {
  const rows = await db
    .select()
    .from(vouchers)
    .where(sql`upper(${vouchers.code}) = upper(${code})`)
    .limit(1);
  return rows[0];
}

export async function findVoucherById(id: string): Promise<Voucher | undefined> {
  const rows = await db.select().from(vouchers).where(eq(vouchers.id, id)).limit(1);
  return rows[0];
}

export async function listVouchers(): Promise<
  Array<Voucher & { venueName: string | null }>
> {
  const rows = await db
    .select({ voucher: vouchers, venueName: venues.name })
    .from(vouchers)
    .leftJoin(venues, eq(venues.id, vouchers.venueId))
    .orderBy(desc(vouchers.createdAt));
  return rows.map((r) => ({ ...r.voucher, venueName: r.venueName }));
}

export async function findVoucherWithVenueById(
  id: string,
): Promise<(Voucher & { venueName: string | null }) | undefined> {
  const rows = await db
    .select({ voucher: vouchers, venueName: venues.name })
    .from(vouchers)
    .leftJoin(venues, eq(venues.id, vouchers.venueId))
    .where(eq(vouchers.id, id))
    .limit(1);
  const r = rows[0];
  return r ? { ...r.voucher, venueName: r.venueName } : undefined;
}

export async function listActiveVenuesForPicker(): Promise<
  Array<{ id: string; name: string }>
> {
  return db
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(and(eq(venues.status, "active"), isNull(venues.deletedAt)))
    .orderBy(asc(venues.name));
}

export async function insertVoucher(input: NewVoucher): Promise<Voucher> {
  const rows = await db.insert(vouchers).values(input).returning();
  const row = rows[0];
  if (!row) throw new Error("voucher insert returned no row");
  return row;
}

export async function updateVoucherStatus(
  id: string,
  status: Voucher["status"],
): Promise<Voucher | undefined> {
  const rows = await db
    .update(vouchers)
    .set({ status, updatedAt: new Date() })
    .where(eq(vouchers.id, id))
    .returning();
  return rows[0];
}

/**
 * Atomic redemption-cap check. Returns the new redemption_count when the
 * increment succeeded, or `null` if the cap was already hit (no row updated).
 *
 * Run inside the booking transaction so a failed increment rolls back the
 * booking insert too.
 */
export async function tryIncrementVoucherRedemption(
  tx: Tx,
  voucherId: string,
): Promise<number | null> {
  const rows = await tx
    .update(vouchers)
    .set({
      redemptionCount: sql`${vouchers.redemptionCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vouchers.id, voucherId),
        sql`(${vouchers.maxRedemptions} is null or ${vouchers.redemptionCount} < ${vouchers.maxRedemptions})`,
      ),
    )
    .returning({ count: vouchers.redemptionCount });
  return rows[0]?.count ?? null;
}

export async function countUserRedemptions(
  tx: Tx,
  voucherId: string,
  userId: string,
): Promise<number> {
  const rows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(voucherRedemptions)
    .where(
      and(
        eq(voucherRedemptions.voucherId, voucherId),
        eq(voucherRedemptions.userId, userId),
      ),
    );
  return rows[0]?.n ?? 0;
}

export async function insertRedemption(
  tx: Tx,
  args: {
    voucherId: string;
    bookingId: string;
    userId: string;
    discountAppliedCentavos: bigint;
  },
): Promise<void> {
  await tx.insert(voucherRedemptions).values(args);
}

export async function getVoucherStats(
  voucherId: string,
): Promise<{ redemptionCount: number; totalDiscountCentavos: bigint }> {
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(${voucherRedemptions.discountAppliedCentavos}), 0)::text`,
    })
    .from(voucherRedemptions)
    .where(eq(voucherRedemptions.voucherId, voucherId));
  const voucher = await findVoucherById(voucherId);
  return {
    redemptionCount: voucher?.redemptionCount ?? 0,
    totalDiscountCentavos: BigInt(rows[0]?.total ?? "0"),
  };
}

export async function listRedemptionsForVoucher(voucherId: string) {
  return db
    .select({
      id: voucherRedemptions.id,
      bookingId: voucherRedemptions.bookingId,
      userId: voucherRedemptions.userId,
      discountAppliedCentavos: voucherRedemptions.discountAppliedCentavos,
      createdAt: voucherRedemptions.createdAt,
      bookingStatus: bookings.status,
    })
    .from(voucherRedemptions)
    .leftJoin(bookings, eq(bookings.id, voucherRedemptions.bookingId))
    .where(eq(voucherRedemptions.voucherId, voucherId))
    .orderBy(desc(voucherRedemptions.createdAt))
    .limit(100);
}
