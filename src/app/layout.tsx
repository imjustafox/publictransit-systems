import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { DistanceUnitProvider } from "@/components/layout/DistanceUnitProvider";
import { Header } from "@/components/layout/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Transit Systems | Public Transit Information Database",
  description: "Comprehensive information about public transit systems worldwide.",
  keywords: [
    "transit",
    "metro",
    "subway",
    "WMATA",
    "Sound Transit",
    "BART",
    "public transportation",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <ThemeProvider>
          <DistanceUnitProvider>
            <Header />
            <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
            <footer className="border-t border-border-primary bg-bg-secondary mt-auto">
              <div className="max-w-7xl mx-auto px-4 py-6 text-center">
                <p className="text-sm text-text-muted font-mono">
                  Made with ❤️ in Redmond Washington • Contribute on{" "}
                  <a
                    href="https://github.com/imjustafox/publictransit-systems"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary underline underline-offset-2 hover:no-underline"
                  >
                    GitHub!
                  </a>
                </p>
              </div>
            </footer>
          </DistanceUnitProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
