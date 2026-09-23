import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScanFlow — QR Analytics",
  description: "Create trackable QR codes, measure scans, and route every interaction.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
