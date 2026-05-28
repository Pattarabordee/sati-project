import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sati Clip - Sensor Lab",
  description: "Sati Clip movement-awareness data collection dashboard.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
