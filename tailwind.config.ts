import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                mono: ["'JetBrains Mono'", "monospace"],
                sans: ["'DM Sans'", "sans-serif"],
            },
            colors: {
                bio: {
                    dark: "#0a0f1e",
                    panel: "#0d1529",
                    border: "#1e3a5f",
                    accent: "#00d4ff",
                    green: "#00ff9d",
                    yellow: "#f5c400",
                    orange: "#ff6b35",
                    red: "#ff2d55",
                    muted: "#4a7fa5",
                },
            },
            animation: {
                "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                "fade-in": "fadeIn 0.5s ease-in-out",
                "slide-up": "slideUp 0.4s ease-out",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                slideUp: {
                    "0%": { transform: "translateY(12px)", opacity: "0" },
                    "100%": { transform: "translateY(0)", opacity: "1" },
                },
            },
        },
    },
    plugins: [],
};
export default config;