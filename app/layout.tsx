import type { Metadata } from "next";
import "./globals.css";
import "./scanflow.css";

export const metadata: Metadata = {
  title: "ScanFlow — Physical Attribution Intelligence",
  description: "Turn every physical QR touchpoint into a measurable acquisition channel, from scan to conversation, order and revenue.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
