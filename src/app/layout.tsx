import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snap Duel",
  description: "Web card battle MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}