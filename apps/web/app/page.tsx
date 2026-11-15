"use client";

import { HomeScreen } from "@/screens/home/home-screen";
import { useView } from "~/lib/use-view";

export default function Page() {
    const { user, location } = useView();
    return <HomeScreen user={user} location={location} />;
}
