import { SettingsScreen } from "@/screens/settings/settings-screen";
import { type SearchParams, oneOf, viewLocation } from "~/lib/view-params";

/** Deep link: /settings?tab=vendors */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <SettingsScreen
            location={await viewLocation(params)}
            tab={oneOf(params.tab, ["notifications", "flag-rules", "vendors", "locations", "security", "integrations", "data"])}
        />
    );
}
