import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Survey V2 — AI Interview Platform",
  description: "Create and manage AI-conducted phone interviews",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">{children}</body>
    </html>
  );
}
