import Link from "next/link";
import { Logo } from "@/components/ui";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { getI18n } from "@/server/i18n";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Buildwise home"><Logo /></Link>
          <LanguageSwitcher />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</main>
      </div>
      <aside className="relative hidden overflow-hidden border-s border-line bg-surface lg:block" aria-hidden>
        <div className="grid-texture absolute inset-0" />
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <p className="font-display text-3xl font-semibold leading-tight tracking-tight text-text">{t("brand.tagline")}</p>
          <p className="mt-3 max-w-md text-muted">{t("brand.support")}</p>
        </div>
        <svg className="absolute right-12 top-16 w-[55%] opacity-70" viewBox="0 0 400 300" fill="none" stroke="var(--line-strong)" strokeWidth="1.5">
          <rect x="20" y="20" width="360" height="260" strokeWidth="6" stroke="var(--faint)" />
          <path d="M20 150h140M160 20v130M240 20v260M240 110h140M240 200h140M20 190h220" strokeWidth="3" stroke="var(--faint)" />
          <path d="M60 280a40 40 0 0 1 40-40" stroke="var(--accent)" />
          <text x="80" y="95" fill="var(--muted)" stroke="none" fontSize="11" letterSpacing="1">LIVING</text>
          <text x="290" y="70" fill="var(--muted)" stroke="none" fontSize="11" letterSpacing="1">BED 1</text>
          <text x="285" y="160" fill="var(--muted)" stroke="none" fontSize="11" letterSpacing="1">BATH</text>
          <text x="80" y="240" fill="var(--muted)" stroke="none" fontSize="11" letterSpacing="1">KITCHEN</text>
        </svg>
      </aside>
    </div>
  );
}
