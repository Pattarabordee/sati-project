import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-noto-sans-thai",
  display: "swap",
});

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
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${notoSans.variable} ${notoSansThai.variable}`}
        style={{
          fontFamily:
            'var(--font-noto-sans-thai), var(--font-noto-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
