import { useTheme } from "next-themes";

/** Resolves active theme, accounting for system theme selection. */
export const useCurrentTheme = () => {
	const { theme, systemTheme } = useTheme();

	if (theme === "dark" || theme === "light") {
		return theme;
	}

	return systemTheme;
};
