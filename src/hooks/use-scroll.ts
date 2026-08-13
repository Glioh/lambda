import { useState, useEffect } from "react";

/** Reports whether document has scrolled beyond supplied pixel threshold. */
export const useScroll = (threshold = 10) => {
	const [isScrolled, setIsScrolled] = useState(false);

	useEffect(() => {
		const handleScroll = () => {
			setIsScrolled(window.scrollY > threshold);
		};

		window.addEventListener("scroll", handleScroll);
		handleScroll();

		return () => window.removeEventListener("scroll", handleScroll);
	}, [threshold]);

	return isScrolled;
};
