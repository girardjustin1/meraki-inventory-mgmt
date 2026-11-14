"use client";

import { useRouter } from "next/navigation";
import { MoreScreen } from "@/screens/more/more-screen";

export function MoreClient() {
    const router = useRouter();
    return <MoreScreen onLock={() => router.push("/lock")} onSignOut={() => router.push("/sign-in")} />;
}
