import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sati — Interactive Demo",
  description: "Sati posture and focus coach dashboard.",
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
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
