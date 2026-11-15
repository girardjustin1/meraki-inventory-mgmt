import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
    stories: ["../docs/**/*.mdx", "../components/**/*.story.tsx", "../screens/**/*.story.tsx"],
    addons: ["@storybook/addon-themes", "@storybook/addon-docs"],
    framework: "@storybook/nextjs-vite",
    staticDirs: ["../public"],
};

export default config;
