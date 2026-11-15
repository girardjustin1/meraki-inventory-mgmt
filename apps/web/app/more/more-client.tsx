"use client";

import { useRouter } from "next/navigation";
import type { LocationId, User } from "@/data/types";
import { MoreScreen } from "@/screens/more/more-screen";

export function MoreClient({ location, user }: { location: LocationId; user: User }) {
    const router = useRouter();
    return <MoreScreen location={location} user={user} onLock={() => router.push("/lock")} onSignOut={() => router.push("/sign-in")} />;
}
