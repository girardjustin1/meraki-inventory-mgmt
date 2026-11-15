"use client";

import { SettingsTeamScreen } from "@/screens/settings-team/settings-team-screen";
import { useView } from "~/lib/use-view";
import { oneOf } from "~/lib/view-params";

/** Deep link: /settings/team?tab=invites */
export default function Page() {
    const { params, user, location } = useView();
    return <SettingsTeamScreen location={location} user={user} initialTab={oneOf(params.tab, ["members", "invites", "permissions"])} />;
}
