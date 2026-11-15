"use client";

import { StockScreen } from "@/screens/stock/stock-screen";
import { useView } from "~/lib/use-view";
import { oneOf, text } from "~/lib/view-params";

/** Deep link: /stock?loc=&tab=polish&line=dnd&finish=gel&status=low&reorder=1&q=acetone */
export default function Page() {
    const { params, user, location } = useView();
    return (
        <StockScreen
            location={location}
            initialTab={oneOf(params.tab, ["supplies", "polish", "tips"])}
            initialStatus={oneOf(params.status, ["all", "out", "low", "over", "unknown"])}
            initialReorderOnly={params.reorder === "1"}
            initialQuery={text(params.q)}
            initialLine={oneOf(params.line, ["all", "opi", "opi-dip", "dnd", "dazzle-dry", "chisel"])}
            initialFinish={oneOf(params.finish, ["regular", "gel", "dip"])}
            user={user}
        />
    );
}
