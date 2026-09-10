import type { Metadata } from "next";
import "./globals.css";
import "./page.css";

export const metadata: Metadata = {
  title: "Refinery Truck Queue",
  description: "FIFO truck queue and programming system"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
