import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3PT Ventures — March Madness Tracker",
  description:
    "Live tracking of every higher-seed bet in the 2025 NCAA Tournament.",
  openGraph: {
    title: "3PT Ventures — March Madness Tracker",
    description:
      "We bet every higher seed in March Madness. Follow along live.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
