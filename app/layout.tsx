import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Koude Cloud",
  description: "Your files. A little more at home.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
