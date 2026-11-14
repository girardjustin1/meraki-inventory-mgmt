import { ActivityScreen } from "@/screens/activity/activity-screen";
import { type SearchParams, oneOf, text, viewLocation } from "~/lib/view-params";

/** Deep link: /activity?loc=&type=adjust&range=30&person=<user id> */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    return (
        <ActivityScreen
            location={await viewLocation(params)}
            type={oneOf(params.type, ["count", "receive", "adjust", "order", "flag"])}
            initialRange={oneOf(params.range, ["7", "30", "90", "year", "all"])}
            initialPerson={text(params.person, 60)}
        />
    );
}
