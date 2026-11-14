import { redirect } from "next/navigation";

/** Older link shape. The order now lives in the query string so the list and the order share one page. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/receive?order=${encodeURIComponent(decodeURIComponent(id))}`);
}
