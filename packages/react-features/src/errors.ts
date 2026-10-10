type DatabaseError = {
  code?: unknown;
  message?: unknown;
};

export function pancoErrorMessage(
  error: unknown,
  fallback = "Não foi possível concluir. Tente novamente.",
) {
  const databaseError =
    error && typeof error === "object" ? (error as DatabaseError) : null;
  const code = String(databaseError?.code || "");
  const message = String(databaseError?.message || "");

  if (code === "23505" && message.includes("categories_name_uq"))
    return "Já existe uma categoria com esse nome.";
  if (code === "23505") return "Já existe um registro com esses dados.";
  if (code === "23514") return "Confira os dados informados e tente novamente.";
  if (error instanceof Error && error.message) return error.message;
  if (message) return message;
  return fallback;
}
