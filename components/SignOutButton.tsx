"use client";

import { useRouter } from "next/navigation";

// Small client action for the (server-rendered) homepage.
export default function SignOutButton({
  className,
  children = "Sign out",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.refresh();
      }}
      className={className}
    >
      {children}
    </button>
  );
}
