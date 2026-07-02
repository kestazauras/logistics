import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ERGOVENT - loading optimizer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`light ${inter.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
