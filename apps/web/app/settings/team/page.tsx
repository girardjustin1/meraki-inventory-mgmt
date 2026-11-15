import { SettingsTeamScreen } from "@/screens/settings-team/settings-team-screen";
import { type SearchParams, oneOf, viewLocation, viewer } from "~/lib/view-params";

/** Deep link: /settings/team?tab=invites */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return <SettingsTeamScreen location={await viewLocation(params)} user={await viewer()} initialTab={oneOf(params.tab, ["members", "invites", "permissions"])} />;
}
