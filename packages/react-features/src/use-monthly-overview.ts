import { useEffect, useState } from "react";
import type { PancoController } from "./use-panco";
import type { MonthlyOverview } from "./types";
export function useMonthlyOverview(panco: PancoController) {
  const [state, setState] = useState<{
    key: string;
    report: MonthlyOverview | null;
    error: string;
  }>({ key: "", report: null, error: "" });
  const key = (panco.session?.user.id || "demo") + ":" + panco.month;
  useEffect(() => {
    let active = true;
    panco
      .loadMonthlyOverview(panco.month)
      .then((report) => {
        if (active) setState({ key, report, error: "" });
      })
      .catch(() => {
        if (active)
          setState((old) => ({
            key,
            report: old.key === key ? old.report : null,
            error:
              "Não foi possível atualizar este mês. Os últimos dados carregados foram mantidos.",
          }));
      });
    return () => {
      active = false;
    };
  }, [key, panco.data]);
  return {
    report: state.key === key ? state.report : null,
    error: state.key === key ? state.error : "",
  };
}
