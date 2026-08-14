import { MarketingChrome } from "@/modules/shell/ui/components/marketing-chrome";

interface Props {
	children: React.ReactNode;
}

const Layout = ({ children }: Props) => {
	return <MarketingChrome>{children}</MarketingChrome>;
};

export default Layout;
