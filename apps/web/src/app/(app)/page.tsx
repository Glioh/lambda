import { resolveUserId } from "@/lib/dev-auth";
import { NewChatView } from "@/modules/home/ui/views/new-chat-view";
import { MarketingHome } from "@/modules/marketing/ui/views/marketing-home";

/**
 * `/` serves the marketing hero when signed out and the new-chat composer when
 * signed in, matching the surrounding chrome chosen by the layout.
 * @returns {Promise<JSX.Element>} The rendered home screen.
 */
const Page = async () => {
	const userId = await resolveUserId();

	return userId ? <NewChatView /> : <MarketingHome />;
};

export default Page;
