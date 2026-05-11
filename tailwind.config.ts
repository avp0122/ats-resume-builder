import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '100%',
            h1: {
              fontSize: '1.875rem',
              fontWeight: '700',
              marginBottom: '0.5rem',
            },
            h2: {
              fontSize: '1.5rem',
              fontWeight: '600',
              marginTop: '1rem',
              marginBottom: '0.5rem',
            },
            h3: {
              fontSize: '1.25rem',
              fontWeight: '600',
              marginTop: '0.75rem',
              marginBottom: '0.25rem',
            },
            p: {
              marginBottom: '0.5rem',
            },
            ul: {
              listStyleType: 'disc',
              paddingLeft: '1.25rem',
              marginBottom: '0.5rem',
            },
            li: {
              marginBottom: '0.25rem',
            },
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
