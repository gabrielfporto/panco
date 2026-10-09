const icons: Record<string, string> = {
  Salário: "💼",
  "Outros ganhos": "✨",
  Ressarcimento: "↩️",
  Moradia: "🏠",
  Saúde: "🩺",
  Alimentação: "🍽️",
  Transporte: "🚌",
  Farmácia: "💊",
  Barbeiro: "💈",
  Lazer: "🎮",
  Compras: "🛍️",
  Assinaturas: "🔁",
  "Manutenção do Carro": "🔧",
};
export function categoryEmoji(name: string, icon?: string) {
  return icon && /\p{Extended_Pictographic}/u.test(icon)
    ? icon
    : icons[name] || "🏷️";
}
