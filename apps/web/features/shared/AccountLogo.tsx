import { useState } from "react";
import { Landmark } from "lucide-react";

// Publishable image token; only a bank domain is sent to Logo.dev.
const token = "pk_Eoub8glOQvCLAyRldVYRiQ";
export function AccountLogo({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const domain = /itau/.test(normalized)
    ? "itau.com.br"
    : /santander/.test(normalized)
      ? "santander.com.br"
      : /nubank/.test(normalized)
        ? "nubank.com.br"
        : /bradesco/.test(normalized)
          ? "bradesco.com.br"
          : /banco do brasil/.test(normalized)
            ? "bb.com.br"
            : /caixa/.test(normalized)
              ? "caixa.gov.br"
              : null;
  return (
    <span className="account-logo">
      {domain && !failed ? (
        <img
          src={`https://img.logo.dev/${domain}?token=${token}&size=64&format=png`}
          alt=""
          width={32}
          height={32}
          onError={() => setFailed(true)}
        />
      ) : (
        <Landmark size={22} aria-hidden="true" />
      )}
    </span>
  );
}

export function cardBankName(card: {name: string; connection_id?: string | null; payment_account_id?: string | null}, accounts: {id:string;name:string;kind:string;connection_id?:string|null}[]) {
  const issuer = card.connection_id && accounts.find(a => a.connection_id === card.connection_id && a.kind !== "investment");
  return issuer ? issuer.name : card.name;
}
