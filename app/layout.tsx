import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kin — listens when they talk, notices when they don't",
  description:
    "A voice-first health companion for people with chronic conditions, with an anomaly-gated triage queue for their care team.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
