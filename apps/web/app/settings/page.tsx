"use client";

import { SettingsScreen } from "@/screens/settings/settings-screen";
import { useView } from "~/lib/use-view";
import { oneOf } from "~/lib/view-params";

/** Deep link: /settings?tab=vendors */
export default function Page() {
    const { params, location } = useView();
    return (
        <SettingsScreen
            location={location}
            tab={oneOf(params.tab, ["notifications", "flag-rules", "vendors", "locations", "security", "integrations", "data"])}
        />
    );
}
