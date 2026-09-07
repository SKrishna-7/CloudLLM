import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "CloudLLM Image Generator",
  description: "Modern Image Generation Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}>
        <body className="min-h-full flex bg-[#000000]">
          <Providers>
            <div className="flex w-full h-screen overflow-hidden p-2">
              <Sidebar />
              <main className="flex-1 flex flex-col min-w-0 bg-[#0A0A0A] rounded-r-2xl border-y border-r border-zinc-800 shadow-sm relative overflow-y-auto">
                {children}
              </main>
            </div>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
