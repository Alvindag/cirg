import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { MeshGradientBackground } from "@/components/layout/MeshGradientBackground";
import { GlassPanel } from "@/components/ui/glass-panel";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "CRM Dashboard",
  description: "A modern, high-performance CRM dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <MeshGradientBackground />
        <div className="min-h-screen p-4 md:p-6">
          <GlassPanel className="min-h-[calc(100vh-2rem)] rounded-2xl md:min-h-[calc(100vh-3rem)]">
            {children}
          </GlassPanel>
        </div>
      </body>
    </html>
  );
}
