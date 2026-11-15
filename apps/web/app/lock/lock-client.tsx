"use client";

import { useRouter } from "next/navigation";
import type { User } from "@/data/types";
import { PinLockScreen } from "@/screens/pin-lock/pin-lock-screen";

/**
 * Prototype wiring: the screen checks the demo PIN itself and we navigate on success.
 * Live wiring (milestone 2): send the PIN to POST /api/pin, which verifies the hash in
 * Supabase and sets the signed `pin_ok` cookie the proxy looks for.
 */
export function LockClient({ next, user }: { next: string; user: User }) {
    const router = useRouter();
    return <PinLockScreen user={user} onUnlock={() => router.push(next)} />;
}
