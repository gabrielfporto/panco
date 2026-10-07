const ignoredDescription = "RES APLIC AUT MAIS";

export function isIgnoredTransaction(transaction: {
  account_id?: string | null;
  description: string;
  merchant_name?: string | null;
}) {
  if (!transaction.account_id) return false;
  return [transaction.description, transaction.merchant_name].some((value) =>
    (value || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .includes(ignoredDescription),
  );
}
