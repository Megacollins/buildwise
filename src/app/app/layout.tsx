import { requireUser } from "@/server/auth";
import { Sidebar, MobileNav, MobileTopBar } from "@/components/shell/AppNav";
import { VerifyEmailBanner } from "@/components/shell/AccountForms";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar userName={user.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        {!user.emailVerifiedAt && <VerifyEmailBanner email={user.email} />}
        <div className="flex-1 pb-20 lg:pb-0">{children}</div>
      </div>
      <MobileNav />
    </div>
  );
}
