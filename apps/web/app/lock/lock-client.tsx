"use client";

import { useRouter } from "next/navigation";
import { PinLockScreen } from "@/screens/pin-lock/pin-lock-screen";

/**
 * Prototype wiring: the screen checks the demo PIN itself and we navigate on success.
 * Live wiring (milestone 2): send the PIN to POST /api/pin, which verifies the hash in
 * Supabase and sets the signed `pin_ok` cookie the proxy looks for.
 */
export function LockClient({ next }: { next: string }) {
    const router = useRouter();
    return <PinLockScreen onUnlock={() => router.push(next)} />;
}
