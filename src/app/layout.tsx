import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Avtoservis Selan",
  description:
    "Operativni sistem za avtoservis — nadzorna plošča, servisni nalogi in termini.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {process.env.SELAN_REMOTE_DEMO === "1" && <div role="note" className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm font-medium text-blue-950">
          Quibi demo – podatki so simulirani. Sporočila niso poslana in termini niso rezervirani v MyPlanlyju.
        </div>}
        {process.env.APP_ENV === "preproduction" && process.env.QUIBI_MODE === "dev" && <div role="note" className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm font-medium text-blue-950">
          Quibi DEV – podatki iz testnega okolja. Zapisovanje in pošiljanje v Quibi nista avtomatska. MyPlanly je trenutno ročen.
        </div>}
        {children}
      </body>
    </html>
  );
}
