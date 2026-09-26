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

import { AppLayout } from "@/components/layout/AppLayout";
import { ChatProvider } from "@/contexts/ChatContext";

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
        <body className="min-h-full flex w-full bg-[#000000]">
          <Providers>
            <ChatProvider>
              <AppLayout>
                {children}
              </AppLayout>
            </ChatProvider>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
