import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans, Fraunces } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const themeInit = `
(function(){
  try {
    var k = 'voicewell-theme';
    var t = localStorage.getItem(k);
    var dark;
    if (t === 'light') dark = false;
    else if (t === 'dark') dark = true;
    else dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  ...(process.env.NEXT_PUBLIC_APP_URL
    ? { metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL) }
    : {}),
  title: {
    default: "Voicewell",
    template: "%s · Voicewell",
  },
  description: "Voicewell app — manage AI voice interviews, campaigns, and transcripts.",
  icons: {
    icon: "/voicewell-logo.png",
    apple: "/voicewell-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${fraunces.variable} min-h-screen antialiased`}>
        <Script id="voicewell-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
