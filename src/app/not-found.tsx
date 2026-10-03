import { LinkButton, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 font-display text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 max-w-md text-[14px] text-muted">This page doesn’t exist, or the project isn’t shared with your account.</p>
      <LinkButton href="/app" variant="primary" className="mt-6">Go to your projects</LinkButton>
    </main>
  );
}
