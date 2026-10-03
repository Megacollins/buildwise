import type { Metadata } from "next";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getI18n, getMeasurementSystem } from "@/server/i18n";
import { I18nProvider } from "@/i18n/client";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
  title: { default: "Buildwise — From an idea to a real home", template: "%s · Buildwise" },
  description:
    "Design your home, explore it in 3D, create detailed plans, customize every finish, and understand your estimated cost — wherever you are in the world.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, messages, info } = await getI18n();
  const system = await getMeasurementSystem();
  return (
    <html lang={info.bcp47} dir={info.dir} className={`${inter.variable} ${display.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">
        <I18nProvider locale={locale} messages={messages} system={system}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
