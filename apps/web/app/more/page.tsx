"use client";

import { useView } from "~/lib/use-view";
import { MoreClient } from "./more-client";

export default function Page() {
    const { user, location } = useView();
    return <MoreClient location={location} user={user} />;
}
