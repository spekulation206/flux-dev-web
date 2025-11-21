import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SessionProvider } from "@/context/SessionContext";
import { NotificationManager } from "@/components/NotificationManager";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Flux Web",
  description: "AI Image Processing Web App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground transition-colors duration-200`}>
        <ThemeProvider>
          <SessionProvider>
            <NotificationManager />
            {children}
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
