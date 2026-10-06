"use client";
import dynamic from "next/dynamic";
const PancoApp = dynamic(
  () => import("../features/shell/PancoApp").then((m) => m.PancoApp),
  {
    ssr: false,
    loading: () => <main className="login-page">Carregando Panco…</main>,
  },
);
export default function Page() {
  return <PancoApp />;
}
