"use client";

import { useRouter } from "next/navigation";
import { SignInScreen } from "@/screens/sign-in/sign-in-screen";

export function SignInClient() {
    const router = useRouter();
    return <SignInScreen onContinue={() => router.push("/lock")} />;
}
