export function groupSimilar<
  T extends {
    account_id: string | null;
    card_id: string | null;
    description: string;
    amount: string | number;
    occurred_at: string;
    direction: string;
    status: string;
    currency: string;
    source: string;
    installment_number?: number | null;
  },
>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  rows.forEach((row, index) => {
    const key =
      row.source === "pluggy"
        ? JSON.stringify([
            row.account_id,
            row.card_id,
            row.description,
            Number(row.amount),
            row.occurred_at,
            row.direction,
            row.status,
            row.currency,
            row.installment_number ?? null,
          ])
        : `manual:${index}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });
  return [...groups.values()];
}
