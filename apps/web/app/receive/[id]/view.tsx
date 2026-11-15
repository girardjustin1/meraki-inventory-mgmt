"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export function View() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    useEffect(() => {
        router.replace(`/receive?order=${encodeURIComponent(decodeURIComponent(id))}`);
    }, [id, router]);
    return null;
}
