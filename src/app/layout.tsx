import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Rehearsal — Build confidence before production",
  description:
    "Run failure scenarios against real sandbox APIs. Inspect what committed, compare recovery strategies, and verify business outcomes.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
