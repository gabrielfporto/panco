import { pancoTokens } from "../../../packages/core/src/theme";
import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./globals.css";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export const metadata: Metadata = {
  title: "Panco · Suas finanças, com clareza",
  description: "Seu espaço pessoal para cuidar das finanças.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body
        style={
          {
            "--forest": pancoTokens.colors.forest,
            "--cream": pancoTokens.colors.background,
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
