export function transactionMonth(
  transaction: { source: string; occurred_at: string },
  timezone = "America/Bahia",
): string {
  if (transaction.source === "pluggy")
    return transaction.occurred_at.slice(0, 7);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(transaction.occurred_at));
  return (
    parts.find((p) => p.type === "year")!.value +
    "-" +
    parts.find((p) => p.type === "month")!.value
  );
}
