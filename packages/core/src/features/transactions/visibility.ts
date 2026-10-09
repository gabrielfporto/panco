const ignoredDescription = /\b(?:RES|APL) APLIC AUT MAIS\b/;

export function isIgnoredTransaction(transaction: {
  account_id?: string | null;
  description: string;
  merchant_name?: string | null;
}) {
  if (!transaction.account_id) return false;
  return [transaction.description, transaction.merchant_name].some((value) =>
    ignoredDescription.test((value || "").toUpperCase().replace(/\s+/g, " ")),
  );
}
