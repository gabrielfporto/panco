type Invoke = (body: Record<string, unknown>) => Promise<any>;

// Each resource can fail independently; committed pages remain resumable.
export async function syncItems(invoke: Invoke, items: string[], register = false) {
  const failures: string[] = [];
  async function attempt(label: string, run: () => Promise<unknown>) {
    try {
      await run();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : "Falha na importação."}`);
    }
  }
  for (const itemId of items) {
    let accounts: { id: string; type: string; name: string }[] = [];
    await attempt("Contas", async () => {
      const result = await invoke({ itemId, register });
      accounts = result.accounts;
    });
    await attempt("Investimentos", () => invoke({ itemId, investments: true }));
    for (const account of accounts) {
      if (account.type === "CREDIT")
        await attempt(`Faturas de ${account.name}`, () =>
          invoke({ itemId, accountId: account.id, bills: true }),
        );
      await attempt(`Transações de ${account.name}`, async () => {
        let more = true;
        for (let page = 0; more && page < 100; page++)
          more = (await invoke({ itemId, accountId: account.id })).more;
        if (more) throw new Error("Importação parcial salva. Sincronize novamente para continuar.");
      });
    }
  }
  if (failures.length)
    throw new Error(`Sincronização parcial. ${[...new Set(failures)].join(" ")}`);
}
