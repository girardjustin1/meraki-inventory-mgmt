import { withThemeByClassName } from "@storybook/addon-themes";
import "../styles/globals.css";
import Wrapper from "./wrapper";

const customViewports = {
    mobile: { name: "Mobile", styles: { width: "375px", height: "100vh" } },
    tablet: { name: "Tablet", styles: { width: "834px", height: "100vh" } },
    desktop: { name: "Desktop", styles: { width: "1440px", height: "100vh" } },
};

export const parameters = {
    layout: "fullscreen",
    options: {
        storySort: {
            method: "alphabetical",
            order: [
                "Meraki",
                ["Introduction", "Foundations", "*"],
                "Screens",
                ["Overview", "Stock", "Scan", "Counts", "Orders", "Receiving", "Flags", "Activity", "Reports", "Digests", "Settings", "Auth", "*"],
                "Base components",
                "Application",
                "Foundations",
                "Shared Assets",
            ],
        },
    },
    controls: {
        matchers: {
            color: /(background|color)$/i,
            date: /Date$/,
        },
    },
    viewport: {
        options: customViewports,
    },
};

export const decorators = [
    withThemeByClassName({
        themes: {
            light: "light-mode",
            dark: "dark-mode",
        },
        defaultTheme: "light",
    }),
    Wrapper,
];
