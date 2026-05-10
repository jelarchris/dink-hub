import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  ledgerEntries,
  profiles,
  type LedgerEntry,
} from "@/db/schema";
import { PAGE_SIZE, type LedgerListFilter } from "./schema";

export interface AdminLedgerRow {
  entry: LedgerEntry;
  createdByEmail: string | null;
}

export interface AccountTotals {
  account: LedgerEntry["account"];
  debit: bigint;
  credit: bigint;
}

export interface PagedLedger {
  rows: ReadonlyArray<AdminLedgerRow>;
  total: number;
  page: number;
  pageSize: number;
  totalsByAccount: ReadonlyArray<AccountTotals>;
}

export async function listLedger(filter: LedgerListFilter): Promise<PagedLedger> {
  const wheres = [];
  if (filter.account !== "all") wheres.push(eq(ledgerEntries.account, filter.account));
  if (filter.bookingId) wheres.push(eq(ledgerEntries.bookingId, filter.bookingId));
  if (filter.payoutId) wheres.push(eq(ledgerEntries.payoutId, filter.payoutId));
  const where = wheres.length > 0 ? and(...wheres) : undefined;

  const baseList = db
    .select({
      entry: ledgerEntries,
      createdByEmail: profiles.email,
    })
    .from(ledgerEntries)
    .leftJoin(profiles, eq(profiles.id, ledgerEntries.createdBy));

  const baseCount = db.select({ n: count() }).from(ledgerEntries);

  const baseTotals = db
    .select({
      account: ledgerEntries.account,
      debit:
        sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'debit' then ${ledgerEntries.amountCentavos} else 0 end), 0)`.mapWith(
          String,
        ),
      credit:
        sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amountCentavos} else 0 end), 0)`.mapWith(
          String,
        ),
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.account);

  const [rows, [c], totalsRaw] = await Promise.all([
    (where ? baseList.where(where) : baseList)
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(PAGE_SIZE)
      .offset((filter.page - 1) * PAGE_SIZE),
    where ? baseCount.where(where) : baseCount,
    where ? baseTotals.where(where) : baseTotals,
  ]);

  const totalsByAccount: AccountTotals[] = totalsRaw.map((t) => ({
    account: t.account,
    debit: BigInt(t.debit),
    credit: BigInt(t.credit),
  }));

  return {
    rows,
    total: c?.n ?? 0,
    page: filter.page,
    pageSize: PAGE_SIZE,
    totalsByAccount,
  };
}
