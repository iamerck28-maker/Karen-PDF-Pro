import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/lib/pdf-polyfill";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Karen PDF Pro | Premium PDF Editor",
  description: "Annotate, draw, and edit your PDF files with ease using Karen PDF Pro.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
