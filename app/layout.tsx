import type { Metadata } from "next";
import "./globals.css";
import "./analytics-platform.css";

export const metadata: Metadata = {
  title: "ScanFlow — QR Analytics",
  description: "Analytics and attribution for physical and virtual QR codes, from scan to conversion and attributed revenue.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
