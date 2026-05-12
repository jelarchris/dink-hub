import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { RecoveryHashRedirect } from "@/components/recovery-hash-redirect";
import { PostHogProvider } from "@/components/posthog-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DinkHub — Book Pickleball Courts in the Philippines",
    template: "%s · DinkHub",
  },
  description:
    "Find and book pickleball courts across the Philippines. Starting in Agusan del Sur. Real-time availability, GCash payment, instant confirmation.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    locale: "en_PH",
    siteName: "DinkHub",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Restore saved theme before first paint — prevents flash of wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dinkhub-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()`,
          }}
        />
        <RecoveryHashRedirect />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
